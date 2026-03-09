/**
 * ClawTalk REST API request/response types.
 *
 * Every endpoint the SDK calls gets typed request params and response.
 * Matches the /v1/* endpoints on the ClawTalk server.
 */

// ── Common ────────────────────────────────────────────────────

export interface PaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface PaginatedResponse<T> {
  readonly data: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ── User ──────────────────────────────────────────────────────

export interface UserMeResponse {
  readonly user_id: string;
  readonly email: string;
  readonly phone: string | null;
  readonly phone_verified: boolean;
  readonly subscription_tier: string;
  readonly effective_tier: string;
  readonly effective_source: string;
  readonly effective_days_remaining: number | null;
  readonly subscription_status: string;
  readonly paranoid_mode: boolean;
  readonly voice_preference: string | null;
  readonly system_number: string | null;
  readonly dedicated_number: string | null;
  readonly created_at: string;
  readonly quota: {
    readonly daily_call_seconds_limit: number;
    readonly daily_calls_limit: number;
    readonly monthly_call_seconds_limit: number;
    readonly monthly_messages_limit: number;
    readonly monthly_missions_limit: number;
    readonly monthly_mission_events_limit: number;
    readonly max_call_duration_seconds: number;
  };
}

// ── Calls ─────────────────────────────────────────────────────

export interface InitiateCallParams {
  readonly to?: string;
  readonly greeting?: string;
  readonly purpose?: string;
}

export interface CallResponse {
  readonly call_id: string;
  readonly status: string;
  readonly direction: 'inbound' | 'outbound';
  readonly from: string;
  readonly to: string;
}

export interface CallStatusResponse {
  readonly call_id: string;
  readonly status: 'ringing' | 'answered' | 'ended' | 'failed';
  readonly duration?: number;
  readonly transcript?: string;
  readonly reason?: string;
}

// ── SMS ───────────────────────────────────────────────────────

export interface SendSmsParams {
  readonly to: string;
  readonly message: string;
  readonly media_urls?: string[];
}

export interface SmsResponse {
  readonly message_id: string;
  readonly from: string;
  readonly to: string;
  readonly status: string;
}

export interface ListMessagesParams extends PaginationParams {
  readonly contact?: string;
  readonly direction?: 'inbound' | 'outbound';
  readonly limit?: number;
}

export interface SmsMessage {
  readonly message_id: string;
  readonly from: string;
  readonly to: string;
  readonly body: string;
  readonly direction: 'inbound' | 'outbound';
  readonly status: string;
  readonly created_at: string;
  readonly media_urls?: string[];
}

export interface MessagesListResponse {
  readonly messages: SmsMessage[];
  readonly total: number;
}

export interface Conversation {
  readonly contact: string;
  readonly last_message: string;
  readonly last_message_at: string;
  readonly unread_count: number;
}

export interface ConversationsResponse {
  readonly conversations: Conversation[];
}

// ── Approvals ─────────────────────────────────────────────────

export interface CreateApprovalParams {
  readonly action: string;
  readonly details?: string;
  readonly require_biometric?: boolean;
  readonly expires_in?: number;
}

export interface ApprovalResponse {
  readonly request_id: string;
  readonly status: 'pending' | 'approved' | 'denied' | 'timeout' | 'no_devices' | 'no_devices_reached';
  readonly devices_notified?: number;
  readonly devices_failed?: number;
}

export interface ApprovalStatusResponse {
  readonly request_id: string;
  readonly status: 'pending' | 'approved' | 'denied' | 'timeout' | 'no_devices' | 'no_devices_reached';
  readonly responded_at?: string;
}

// ── Assistants ────────────────────────────────────────────────

export interface CreateAssistantParams {
  readonly name: string;
  readonly instructions: string;
  readonly greeting?: string;
  readonly voice?: string;
  readonly model?: string;
  readonly io_screening?: boolean;
  readonly tools?: AssistantTool[];
}

export interface AssistantTool {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface AssistantResponse {
  readonly id: string;
  readonly name: string;
  readonly instructions: string;
  readonly greeting: string | null;
  readonly voice: string | null;
  readonly model: string | null;
  readonly connection_id: string | null;
  readonly created_at: string;
}

export interface AssistantFilter {
  readonly name?: string;
}

export interface AssistantListResponse {
  readonly assistants: AssistantResponse[];
}

// ── Phone Numbers ─────────────────────────────────────────────

export interface PhoneNumber {
  readonly id: string;
  readonly phone_number: string;
  readonly connection_id: string | null;
  readonly hd_voice: boolean;
  readonly status: string;
}

export interface PhoneResponse {
  readonly id: string;
  readonly phone_number: string;
  readonly hd_voice: boolean;
}

// ── Scheduled Events ──────────────────────────────────────────

export interface ScheduleCallParams {
  readonly assistant_id: string;
  readonly to: string;
  readonly from: string;
  readonly scheduled_at: string;
  readonly mission_id?: string;
  readonly run_id?: string;
}

export interface ScheduleSmsParams {
  readonly assistant_id: string;
  readonly to: string;
  readonly from: string;
  readonly scheduled_at: string;
  readonly message: string;
  readonly mission_id?: string;
  readonly run_id?: string;
}

export interface ScheduledEventResponse {
  readonly id: string;
  readonly type: 'call' | 'sms';
  readonly status: string;
  readonly scheduled_at: string;
}

export interface ScheduledEventDetailResponse extends ScheduledEventResponse {
  readonly assistant_id: string;
  readonly to: string;
  readonly from: string;
  readonly call_id?: string;
  readonly call_status?: string;
  readonly call_duration?: number;
  readonly conversation_id?: string;
  readonly completed_at?: string;
}

// ── Missions ──────────────────────────────────────────────────

export interface CreateMissionParams {
  readonly name: string;
  readonly instructions: string;
}

export interface MissionResponse {
  readonly id: string;
  readonly name: string;
  readonly instructions: string;
  readonly status: string;
  readonly created_at: string;
}

export interface MissionDetailResponse {
  readonly mission: MissionResponse;
}

export interface MissionListResponse {
  readonly missions: MissionResponse[];
}

// ── Runs ──────────────────────────────────────────────────────

export interface CreateRunParams {
  readonly input: Record<string, unknown>;
}

export interface RunResponse {
  readonly id: string;
  readonly run_id?: string;
  readonly mission_id: string;
  readonly status: string;
  readonly input: Record<string, unknown>;
  readonly result_summary?: string;
  readonly result_payload?: Record<string, unknown>;
  readonly created_at: string;
  readonly completed_at?: string;
}

export interface RunUpdateParams {
  readonly status?: string;
  readonly result_summary?: string;
  readonly result_payload?: Record<string, unknown>;
}

export interface RunListResponse {
  readonly data: RunResponse[];
}

// ── Plans ─────────────────────────────────────────────────────

export interface CreatePlanStepInput {
  readonly title: string;
  readonly description?: string;
}

export interface PlanStepResponse {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  readonly order: number;
}

export interface PlanResponse {
  readonly steps: PlanStepResponse[];
}

export interface UpdateStepParams {
  readonly status: string;
}

// ── Events (Mission) ──────────────────────────────────────────

export interface LogMissionEventParams {
  readonly type: string;
  readonly summary: string;
  readonly agent_id?: string;
  readonly step_id?: string;
  readonly payload?: Record<string, unknown>;
}

export interface MissionEventResponse {
  readonly id: string;
  readonly type: string;
  readonly summary: string;
  readonly step_id?: string;
  readonly payload?: Record<string, unknown>;
  readonly created_at: string;
}

export interface MissionEventListResponse {
  readonly data: MissionEventResponse[];
}

// ── Assistant Connection ──────────────────────────────────────

export interface AssistantConnectionResponse {
  readonly connection_id: string;
}

// ── Phone Number Assignment ───────────────────────────────────

export interface AssignPhoneParams {
  readonly connection_id: string;
  readonly type: string;
}

// ── Insights ──────────────────────────────────────────────────

export interface InsightsResponse {
  readonly conversation_id: string;
  readonly summary: string;
  readonly sentiment: string;
  readonly key_topics: string[];
  readonly action_items: string[];
}

// ── Linked Agents ─────────────────────────────────────────────

export interface LinkedAgentsResponse {
  readonly agents: Array<{
    readonly agent_id: string;
    readonly linked_at: string;
  }>;
}
