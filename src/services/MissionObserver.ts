/**
 * MissionObserver — background mission lifecycle nudges.
 *
 * Runs on a fixed interval (default 5m) independent of chat turns.
 * Checks running missions for:
 * 1. Pending/scheduled call follow-ups
 * 2. Stale missions (no activity > stale threshold)
 * 3. All-terminal plans that are still marked running
 *
 * When actionable, triggers a mission-session agent turn in
 * `clawtalk:mission:<slug>` with a resolution prompt.
 */

import type { Logger } from '../types/plugin.js';
import type { ICoreBridge } from './CoreBridge.js';
import type { MissionService } from './MissionService.js';

const TERMINAL_STEP_STATUSES = new Set(['completed', 'failed', 'skipped']);
const PENDING_EVENT_STATUSES = new Set(['pending', 'scheduled']);

export interface MissionObserverConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly staleThresholdMs: number;
  readonly cooldowns: {
    readonly pendingCallsMs: number;
    readonly staleMs: number;
    readonly terminalPlanMs: number;
  };
}

export interface MissionObserverDeps {
  readonly missions: MissionService;
  readonly coreBridge: ICoreBridge;
  readonly logger: Logger;
  readonly config: MissionObserverConfig;
}

type NudgeState = {
  pendingCallsAt?: number;
  staleAt?: number;
  terminalPlanAt?: number;
};

type MissionAction =
  | { type: 'pending_calls'; detail: string }
  | { type: 'call_outcomes'; detail: string }
  | { type: 'stale'; detail: string }
  | { type: 'terminal_plan'; detail: string };

export class MissionObserver {
  private readonly missions: MissionService;
  private readonly coreBridge: ICoreBridge;
  private readonly logger: Logger;
  private readonly config: MissionObserverConfig;

  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly lastNudges = new Map<string, NudgeState>();

  constructor(deps: MissionObserverDeps) {
    this.missions = deps.missions;
    this.coreBridge = deps.coreBridge;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  start(): void {
    if (!this.config.enabled) {
      this.logger.info('[MissionObserver] Disabled via config.');
      return;
    }
    if (this.interval) return;

    const tick = () => {
      this.check().catch((err) => {
        this.logger.warn?.(
          `[MissionObserver] Tick failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    };

    tick();
    this.interval = setInterval(tick, this.config.intervalMs);
    this.interval.unref?.();

    this.logger.info(`[MissionObserver] Started (${Math.round(this.config.intervalMs / 1000)}s interval).`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info('[MissionObserver] Stopped.');
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private async check(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const serverMissions = await this.fetchRunningMissions();
      if (serverMissions.length === 0) {
        this.logger.info('[MissionObserver] No running missions found.');
        return;
      }
      this.logger.info(`[MissionObserver] Running missions from server: ${serverMissions.length}`);

      const localMissions = await this.missions.listMissions();
      const slugByMissionId = new Map(
        localMissions
          .filter((m) => m.state.mission_id)
          .map((m) => [m.state.mission_id ?? '', m.slug]),
      );

      for (const mission of serverMissions) {
        const slug = slugByMissionId.get(mission.id);
        if (!slug) {
          this.logger.info(`[MissionObserver] Skip mission ${mission.id} (${mission.name}) — not in local state map`);
          continue;
        }

        this.logger.info(`[MissionObserver] Checking mission ${mission.name} (${slug})`);

        const actions = await this.collectActions(mission, slug);
        this.logger.info(`[MissionObserver] Actions detected for ${slug}: ${actions.map((a) => a.type).join(', ') || 'none'}`);
        const dueActions = this.filterByCooldown(slug, actions);
        this.logger.info(`[MissionObserver] Actions after cooldown for ${slug}: ${dueActions.map((a) => a.type).join(', ') || 'none'}`);

        if (dueActions.length === 0) continue;

        const sent = await this.sendMissionPrompt({
          slug,
          name: mission.name,
          actions: dueActions,
        });

        if (sent) {
          this.markNudged(slug, dueActions);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchRunningMissions(): Promise<
    Array<{ id: string; name: string; status: string; updated_at?: string }>
  > {
    try {
      const client = this.missions.getClient();
      const all = await client.missions.list(50);
      return (all as unknown as Array<Record<string, unknown>>).filter(
        (m) => m.status === 'running',
      ) as unknown as Array<{ id: string; name: string; status: string; updated_at?: string }>;
    } catch (err) {
      this.logger.warn?.(
        `[MissionObserver] Failed to fetch missions: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async collectActions(
    mission: { id: string; name: string; status: string; updated_at?: string },
    slug: string,
  ): Promise<MissionAction[]> {
    const actions: MissionAction[] = [];

    let steps: Array<{ id?: string; step_id?: string; title: string; status: string }> = [];
    let scheduledEvents: Array<{ id: string; channel: string; status: string; step_id?: string; call_status?: string | null }> = [];

    try {
      const plan = await this.missions.getPlan(slug);
      steps = ((plan as unknown as Record<string, unknown>)?.steps ?? plan ?? []) as unknown as typeof steps;
      this.logger.info(`[MissionObserver] ${slug}: plan steps=${steps.length}`);
    } catch (err) {
      this.logger.warn?.(`[MissionObserver] ${slug}: failed to fetch plan: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const evts = await this.missions.getEvents(slug);
      scheduledEvents =
        ((evts as unknown as Record<string, unknown>)?.scheduled_events ?? []) as typeof scheduledEvents;
      this.logger.info(`[MissionObserver] ${slug}: scheduled events=${scheduledEvents.length}`);
    } catch (err) {
      this.logger.warn?.(`[MissionObserver] ${slug}: failed to fetch events: ${err instanceof Error ? err.message : String(err)}`);
    }

    const pendingCallEvents = scheduledEvents.filter(
      (e) => e.channel === 'call' && PENDING_EVENT_STATUSES.has(e.status),
    );
    if (pendingCallEvents.length > 0) {
      this.logger.info(`[MissionObserver] ${slug}: pending call events=${pendingCallEvents.length}`);
      actions.push({
        type: 'pending_calls',
        detail: `${pendingCallEvents.length} pending call(s) require follow-up.`,
      });
    }

    const unresolvedCallOutcomes = scheduledEvents.filter(
      (e) =>
        e.channel === 'call' &&
        e.status === 'completed' &&
        !!e.call_status &&
        e.call_status !== 'completed',
    );
    if (unresolvedCallOutcomes.length > 0) {
      const statuses = [...new Set(unresolvedCallOutcomes.map((e) => e.call_status).filter(Boolean))].join(', ');
      this.logger.info(`[MissionObserver] ${slug}: unresolved call outcomes=${unresolvedCallOutcomes.length} (${statuses})`);
      actions.push({
        type: 'call_outcomes',
        detail: `${unresolvedCallOutcomes.length} completed call event(s) need resolution (call_status: ${statuses}).`,
      });
    }

    const updatedAt = mission.updated_at ? new Date(mission.updated_at).getTime() : 0;
    const now = Date.now();
    const isStale = updatedAt > 0 && now - updatedAt > this.config.staleThresholdMs;

    if (isStale) {
      const hours = Math.round((now - updatedAt) / 3_600_000);
      this.logger.info(`[MissionObserver] ${slug}: stale mission detected (~${hours}h idle)`);
      actions.push({
        type: 'stale',
        detail: `No activity for ~${hours} hours.`,
      });
      return actions;
    }

    if (steps.length > 0 && steps.every((s) => TERMINAL_STEP_STATUSES.has(s.status))) {
      const summary = steps.map((s) => `${s.title}: ${s.status}`).join(', ');
      actions.push({
        type: 'terminal_plan',
        detail: `All steps are terminal (${summary}) but mission is still running.`,
      });
    }

    return actions;
  }

  private filterByCooldown(slug: string, actions: MissionAction[]): MissionAction[] {
    if (actions.length === 0) return actions;

    const now = Date.now();
    const state = this.lastNudges.get(slug);

    return actions.filter((action) => {
      const last = state?.[this.mapActionKey(action.type)];
      const cooldown = this.cooldownFor(action.type);
      if (!last) return true;
      const allowed = now - last >= cooldown;
      if (!allowed) {
        const remainingMs = cooldown - (now - last);
        this.logger.info(
          `[MissionObserver] ${slug}: suppress ${action.type} due to cooldown (${Math.ceil(remainingMs / 1000)}s remaining)`,
        );
      }
      return allowed;
    });
  }

  private cooldownFor(type: MissionAction['type']): number {
    switch (type) {
      case 'pending_calls':
      case 'call_outcomes':
        return this.config.cooldowns.pendingCallsMs;
      case 'stale':
        return this.config.cooldowns.staleMs;
      case 'terminal_plan':
        return this.config.cooldowns.terminalPlanMs;
      default:
        return this.config.cooldowns.pendingCallsMs;
    }
  }

  private mapActionKey(type: MissionAction['type']): keyof NudgeState {
    switch (type) {
      case 'pending_calls':
      case 'call_outcomes':
        return 'pendingCallsAt';
      case 'stale':
        return 'staleAt';
      case 'terminal_plan':
        return 'terminalPlanAt';
      default:
        return 'pendingCallsAt';
    }
  }

  private markNudged(slug: string, actions: MissionAction[]): void {
    const now = Date.now();
    const state = this.lastNudges.get(slug) ?? {};

    for (const action of actions) {
      state[this.mapActionKey(action.type)] = now;
    }

    this.lastNudges.set(slug, state);
  }

  private async sendMissionPrompt(params: {
    slug: string;
    name: string;
    actions: MissionAction[];
  }): Promise<boolean> {
    const sessionKey = `clawtalk:mission:${params.slug}`;

    const lines = [
      `[ClawTalk Mission Check] Mission "${params.name}" (${params.slug}) needs attention.`,
      ...params.actions.map((a) => `- ${a.detail}`),
      '',
      'Please review the mission status and take action:',
      '1. Use `clawtalk_mission_event_status` to resolve pending calls and completed non-success call outcomes',
      '2. Advance remaining steps or update the plan status',
      '3. Complete or fail the mission if work is finished',
    ];

    try {
      this.logger.info(`[MissionObserver] Sending prompt to ${sessionKey}`);
      await this.coreBridge.runAgentTurn({
        sessionKey,
        prompt: lines.join('\n'),
        timeoutMs: 60_000,
      });
      return true;
    } catch (err) {
      this.logger.warn?.(
        `[MissionObserver] Failed to send prompt for ${params.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}
