/**
 * ClawTalk mission domain types.
 *
 * Missions represent multi-step AI workflows: create mission → create run →
 * create plan → schedule events → poll → complete.
 *
 * State shape mirrors the Python telnyx_api.py flat per-slug structure.
 */

// ── Enums ─────────────────────────────────────────────────────

export const StepStatus = {
  Pending: 'pending',
  InProgress: 'in_progress',
  Completed: 'completed',
  Failed: 'failed',
  Skipped: 'skipped',
} as const;

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

export const EventType = {
  StepStarted: 'step_started',
  StepCompleted: 'step_completed',
  StepFailed: 'step_failed',
  CallScheduled: 'call_scheduled',
  CallCompleted: 'call_completed',
  SmsScheduled: 'sms_scheduled',
  SmsSent: 'sms_sent',
  AgentLinked: 'agent_linked',
  AgentUnlinked: 'agent_unlinked',
  Note: 'note',
  Error: 'error',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ── State Management ──────────────────────────────────────────

/**
 * Per-mission local state, persisted as flat key/value per slug.
 * Mirrors Python's .missions_state.json structure exactly.
 */
export interface MissionSlugState {
  mission_name?: string;
  mission_id?: string;
  run_id?: string;
  assistant_id?: string;
  agent_phone?: string;
  phone_number_id?: string;
  created_at?: string;
  last_updated?: string;
  memory?: Record<string, unknown>;
}

/**
 * Root state file: slug → flat state.
 * e.g. { "my-mission": { mission_id: "...", run_id: "...", ... } }
 */
export type MissionsStateFile = Record<string, MissionSlugState>;

// ── Service Method Params ─────────────────────────────────────

export interface InitMissionParams {
  readonly name: string;
  readonly instructions: string;
  readonly request: string;
  readonly steps?: Array<{
    readonly title: string;
    readonly description?: string;
  }>;
}

export interface InitMissionResult {
  readonly missionId: string;
  readonly runId: string;
  readonly slug: string;
  readonly resumed: boolean;
}

export interface SetupAgentParams {
  readonly missionSlug: string;
  readonly name: string;
  readonly instructions: string;
  readonly greeting?: string;
  readonly voice?: string;
  readonly model?: string;
  readonly tools?: Array<Record<string, unknown>>;
  readonly features?: string[];
  readonly description?: string;
}

export interface SetupAgentResult {
  readonly assistantId: string;
  readonly phone: string | null;
}

export interface CompleteMissionParams {
  readonly missionSlug: string;
  readonly summary: string;
  readonly payload?: Record<string, unknown>;
}

export interface ScheduleCallEventParams {
  readonly missionSlug: string;
  readonly to: string;
  readonly scheduledAt: string;
  readonly stepId?: string;
}

export interface ScheduleSmsEventParams {
  readonly missionSlug: string;
  readonly to: string;
  readonly scheduledAt: string;
  readonly textBody: string;
  readonly stepId?: string;
}

export interface LogEventParams {
  readonly type: string;
  readonly summary: string;
  readonly agentId?: string;
  readonly stepId?: string;
  readonly payload?: Record<string, unknown>;
}

// ── Assistant Types (re-exported from api for convenience) ────

export type { AssistantResponse, InsightsResponse } from '../lib/clawtalk-sdk/types.js';
