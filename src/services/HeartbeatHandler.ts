/**
 * HeartbeatHandler — Mission polling + stale mission reaping on heartbeat.
 *
 * Registered as a `before_agent_start` hook. On heartbeat turns in the main
 * session, queries running missions and:
 *
 * 1. Injects polling context if any missions have pending/scheduled call events
 * 2. Sends resolution prompts into stale mission sessions (no activity >2h or
 *    all steps terminal but mission still running)
 *
 * Replaces the standalone Mission Reaper service (7B.6).
 */

import type { Logger } from '../types/plugin.js';
import type { ICoreBridge } from './CoreBridge.js';
import type { MissionService } from './MissionService.js';

/** How old (ms) before a mission is considered stale. */
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Heartbeat prompt patterns to detect. */
const HEARTBEAT_PATTERNS = [
  'heartbeat',
  'read heartbeat.md',
];

const TERMINAL_STEP_STATUSES = new Set(['completed', 'failed', 'skipped']);
const PENDING_EVENT_STATUSES = new Set(['pending', 'scheduled']);

export interface HeartbeatHandlerDeps {
  readonly missions: MissionService;
  readonly coreBridge: ICoreBridge;
  readonly logger: Logger;
}

export class HeartbeatHandler {
  private readonly missions: MissionService;
  private readonly coreBridge: ICoreBridge;
  private readonly logger: Logger;

  constructor(deps: HeartbeatHandlerDeps) {
    this.missions = deps.missions;
    this.coreBridge = deps.coreBridge;
    this.logger = deps.logger;
  }

  /**
   * Returns true if the prompt looks like a heartbeat poll.
   */
  isHeartbeat(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    const match = HEARTBEAT_PATTERNS.some((p) => lower.includes(p));
    this.logger.info(`[Heartbeat] isHeartbeat check: match=${match} prompt="${prompt.substring(0, 60)}..."`);
    return match;
  }

  /**
   * Called from the before_agent_start hook on heartbeat turns.
   * Returns context string to prepend, or undefined if nothing to inject.
   */
  async check(): Promise<string | undefined> {
    // Get missions from server API (includes status)
    let serverMissions: Array<{ id: string; name: string; status: string; updated_at?: string; slug?: string }>;
    try {
      const client = this.missions.getClient();
      const all = await client.missions.list(50);
      serverMissions = (all as unknown as Array<Record<string, unknown>>).filter(
        (m) => m.status === 'running',
      ) as unknown as typeof serverMissions;
    } catch (err) {
      this.logger.warn?.(
        `[Heartbeat] Failed to fetch missions: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }

    if (serverMissions.length === 0) {
      this.logger.info('[Heartbeat] No running missions found. Nothing to inject.');
      return undefined;
    }

    this.logger.info(`[Heartbeat] Found ${serverMissions.length} running mission(s), checking status...`);

    // Map server missions to local slugs
    const localMissions = await this.missions.listMissions();
    const slugByMissionId = new Map(
      localMissions
        .filter((m) => m.state.mission_id)
        .map((m) => [m.state.mission_id ?? '', m.slug]),
    );

    const pendingCalls: string[] = [];
    const reapTargets: Array<{ slug: string; name: string; reason: string }> = [];

    for (const mission of serverMissions) {
      const slug = slugByMissionId.get(mission.id);
      if (!slug) continue; // Not tracked locally

      // Fetch plan steps and events for this mission
      let steps: Array<{ id: string; title: string; status: string }> = [];
      let events: Array<{ id: string; channel: string; status: string; step_id?: string }> = [];

      try {
        const plan = await this.missions.getPlan(slug);
        steps = ((plan as unknown as Record<string, unknown>)?.steps ?? plan ?? []) as unknown as typeof steps;
      } catch {
        // No plan or error fetching
      }

      try {
        const evts = await this.missions.getEvents(slug);
        events = (Array.isArray(evts) ? evts : (evts as unknown as Record<string, unknown>)?.events ?? []) as unknown as typeof events;
      } catch {
        // No events or error fetching
      }

      // Check for pending call events
      const pendingCallEvents = events.filter(
        (e) => e.channel === 'call' && PENDING_EVENT_STATUSES.has(e.status),
      );
      if (pendingCallEvents.length > 0) {
        pendingCalls.push(
          `- **${mission.name}** (${slug}): ${pendingCallEvents.length} pending call(s)`,
        );
      }

      // Check for stale missions (no activity >2h)
      const updatedAt = mission.updated_at ? new Date(mission.updated_at).getTime() : 0;
      const now = Date.now();
      const isStale = updatedAt > 0 && now - updatedAt > STALE_THRESHOLD_MS;

      if (isStale) {
        const hours = Math.round((now - updatedAt) / 3_600_000);
        reapTargets.push({
          slug,
          name: mission.name,
          reason: `No activity for ~${hours} hours.`,
        });
        continue;
      }

      // Check for all-terminal steps but mission still running
      if (steps.length > 0 && steps.every((s) => TERMINAL_STEP_STATUSES.has(s.status))) {
        const summary = steps.map((s) => `${s.title}: ${s.status}`).join(', ');
        reapTargets.push({
          slug,
          name: mission.name,
          reason: `All steps are terminal (${summary}) but mission is still running.`,
        });
      }
    }

    // Send resolution prompts to stale/completed missions
    for (const target of reapTargets) {
      await this.sendResolutionPrompt(target);
    }

    // Build context for pending calls
    if (pendingCalls.length === 0) {
      if (reapTargets.length > 0) {
        this.logger.info(
          `[Heartbeat] No pending calls. Sent resolution prompts to ${reapTargets.length} mission(s).`,
        );
      }
      return undefined;
    }

    const context = [
      '[ClawdTalk] You have active missions with pending calls. Check their status:',
      ...pendingCalls,
      '',
      'Use `clawtalk_mission_event_status` to check if calls have completed, then progress the mission accordingly.',
    ].join('\n');

    this.logger.info(
      `[Heartbeat] Injecting context: ${pendingCalls.length} mission(s) with pending calls, ${reapTargets.length} reaped.`,
    );

    return context;
  }

  // ── Private ─────────────────────────────────────────────────

  private async sendResolutionPrompt(target: {
    slug: string;
    name: string;
    reason: string;
  }): Promise<void> {
    const sessionKey = `clawtalk:mission:${target.slug}`;

    const prompt = [
      `[ClawdTalk Mission Check] Mission "${target.name}" (${target.slug}) needs resolution.`,
      target.reason,
      '',
      'Please review the mission status and either:',
      '1. Complete it with `clawtalk_mission_complete` if all objectives are met',
      '2. Take action on remaining steps if work is still needed',
      '3. Mark it as failed if it cannot be completed',
    ].join('\n');

    try {
      this.logger.info(`[Heartbeat] Sending resolution prompt to session ${sessionKey}`);
      await this.coreBridge.runAgentTurn({
        sessionKey,
        prompt,
        timeoutMs: 60_000,
      });
    } catch (err) {
      this.logger.warn?.(
        `[Heartbeat] Failed to send resolution for ${target.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
