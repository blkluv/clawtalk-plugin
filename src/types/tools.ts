/**
 * Agent tool parameter and result types.
 *
 * Each tool registered via api.registerTool() has typed params (input from the model)
 * and typed results (returned to the model). TypeBox schemas (for registerTool) are
 * defined alongside the tool implementations in src/tools/.
 */

import type { StepStatus } from './missions.js';

// ── Call Tools ────────────────────────────────────────────────

export interface CallToolParams {
  readonly to: string;
  readonly greeting?: string;
  readonly purpose?: string;
}

export interface CallToolResult {
  readonly callId: string;
  readonly status: string;
  readonly from: string;
  readonly to: string;
  readonly message: string;
}

export interface CallStatusToolParams {
  readonly callId: string;
  readonly action?: 'status' | 'end';
}

export interface CallStatusToolResult {
  readonly callId: string;
  readonly status: string;
  readonly duration?: number;
  readonly transcript?: string;
  readonly message: string;
}

// ── SMS Tools ─────────────────────────────────────────────────

export interface SmsToolParams {
  readonly to: string;
  readonly message: string;
  readonly mediaUrls?: string[];
}

export interface SmsToolResult {
  readonly messageId: string;
  readonly from: string;
  readonly status: string;
  readonly message: string;
}

export interface SmsListToolParams {
  readonly limit?: number;
  readonly contact?: string;
  readonly direction?: 'inbound' | 'outbound';
}

export interface SmsListToolResult {
  readonly messages: Array<{
    readonly from: string;
    readonly to: string;
    readonly body: string;
    readonly direction: string;
    readonly createdAt: string;
  }>;
  readonly total: number;
}

export interface SmsConversationsToolResult {
  readonly conversations: Array<{
    readonly contact: string;
    readonly lastMessage: string;
    readonly lastMessageAt: string;
    readonly unreadCount: number;
  }>;
}

// ── Approval Tool ─────────────────────────────────────────────

export interface ApproveToolParams {
  readonly action: string;
  readonly details?: string;
  readonly biometric?: boolean;
  readonly timeout?: number;
}

export interface ApproveToolResult {
  readonly decision: string;
  readonly message: string;
}

// ── Status Tool ───────────────────────────────────────────────

export interface StatusToolResult {
  readonly connected: boolean;
  readonly server: string;
  readonly version: string;
  readonly user?: string;
  readonly websocketState: string;
  readonly lastPingAt?: string;
  readonly lastPongAt?: string;
  readonly message: string;
}

// ── Mission Tools ─────────────────────────────────────────────

export interface MissionInitToolParams {
  readonly name: string;
  readonly instructions: string;
  readonly request: string;
  readonly steps?: string; // JSON string of step array
}

export interface MissionInitToolResult {
  readonly missionId: string;
  readonly runId: string;
  readonly slug: string;
  readonly resumed: boolean;
  readonly message: string;
}

export interface MissionSetupAgentToolParams {
  readonly slug: string;
  readonly name: string;
  readonly instructions: string;
  readonly greeting?: string;
  readonly voice?: string;
  readonly model?: string;
}

export interface MissionSetupAgentToolResult {
  readonly assistantId: string;
  readonly phone: string | null;
  readonly message: string;
}

export interface MissionScheduleToolParams {
  readonly slug: string;
  readonly channel: 'call' | 'sms';
  readonly to: string;
  readonly scheduledAt: string;
  readonly textBody?: string;
  readonly stepId?: string;
}

export interface MissionScheduleToolResult {
  readonly eventId: string;
  readonly channel: string;
  readonly scheduledAt: string;
  readonly message: string;
}

export interface MissionEventStatusToolParams {
  readonly slug: string;
  readonly eventId: string;
}

export interface MissionEventStatusToolResult {
  readonly eventId: string;
  readonly channel: string;
  readonly status: string;
  readonly callStatus?: string | null;
  readonly conversationId?: string | null;
  readonly message: string;
}

export interface MissionCompleteToolParams {
  readonly slug: string;
  readonly summary: string;
  readonly payload?: string; // JSON string
}

export interface MissionCompleteToolResult {
  readonly message: string;
}

export interface MissionUpdateStepToolParams {
  readonly slug: string;
  readonly stepId: string;
  readonly status: StepStatus;
}

export interface MissionUpdateStepToolResult {
  readonly message: string;
}

export interface MissionLogEventToolParams {
  readonly slug: string;
  readonly type: string;
  readonly summary: string;
  readonly stepId?: string;
  readonly payload?: string; // JSON string
}

export interface MissionLogEventToolResult {
  readonly message: string;
}

export interface MissionMemoryToolParams {
  readonly action: 'save' | 'append' | 'get';
  readonly slug: string;
  readonly key: string;
  readonly value?: string; // JSON string for save/append
}

export interface MissionMemoryToolResult {
  readonly data?: unknown;
  readonly message: string;
}

export interface MissionListToolResult {
  readonly missions: Array<{
    readonly slug: string;
    readonly missionName?: string;
    readonly missionId?: string;
  }>;
  readonly message: string;
}

export interface MissionGetPlanToolParams {
  readonly slug: string;
}

export interface MissionCancelEventToolParams {
  readonly slug: string;
  readonly eventId: string;
}

// ── Assistant Tool ────────────────────────────────────────────

export interface AssistantsToolParams {
  readonly action: 'list' | 'get' | 'create' | 'update';
  readonly assistantId?: string;
  readonly name?: string;
  readonly instructions?: string;
  readonly greeting?: string;
  readonly voice?: string;
  readonly model?: string;
  readonly updates?: string; // JSON string for update
}

export interface AssistantsToolResult {
  readonly data: unknown;
  readonly message: string;
}

// ── Insights Tool ─────────────────────────────────────────────

export interface InsightsToolParams {
  readonly conversationId: string;
}

export interface InsightsToolResult {
  readonly data: unknown;
  readonly message: string;
}
