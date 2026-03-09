/**
 * Typed HTTP client for the ClawTalk REST API.
 *
 * Every endpoint returns a typed response. Errors throw ApiError.
 * Uses native fetch (Node 22+).
 */

import type { ResolvedClawTalkConfig } from '../config.js';
import type {
  ApprovalResponse,
  ApprovalStatusResponse,
  AssignPhoneParams,
  AssistantConnectionResponse,
  AssistantFilter,
  AssistantListResponse,
  AssistantResponse,
  CallResponse,
  CallStatusResponse,
  ConversationsResponse,
  CreateApprovalParams,
  CreateAssistantParams,
  CreateMissionParams,
  CreatePlanStepInput,
  InitiateCallParams,
  InsightsResponse,
  LinkedAgentsResponse,
  ListMessagesParams,
  LogMissionEventParams,
  MessagesListResponse,
  MissionDetailResponse,
  MissionEventListResponse,
  MissionEventResponse,
  MissionListResponse,
  MissionResponse,
  PhoneResponse,
  PlanResponse,
  PlanStepResponse,
  RunListResponse,
  RunResponse,
  RunUpdateParams,
  ScheduleCallParams,
  ScheduledEventDetailResponse,
  ScheduledEventResponse,
  ScheduleSmsParams,
  SendSmsParams,
  SmsResponse,
  UserMeResponse,
} from '../types/api.js';
import type { Logger } from '../types/plugin.js';
import { ApiError } from '../utils/errors.js';

export class ApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(config: ResolvedClawTalkConfig, logger: Logger, timeoutMs = 30000) {
    this.baseUrl = config.server.replace(/\/$/, '');
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };
    this.logger = logger;
    this.timeoutMs = timeoutMs;
  }

  // ── Private request helper ────────────────────────────────

  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const signal = AbortSignal.timeout(this.timeoutMs);

    this.logger.debug?.(`${method} ${endpoint}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new ApiError(408, `Request timed out: ${method} ${endpoint}`);
      }
      throw new ApiError(0, `Network error: ${method} ${endpoint} — ${String(err)}`);
    }

    const responseBody = await response.text();

    if (!response.ok) {
      this.logger.warn?.(`API ${response.status}: ${method} ${endpoint}`);
      throw new ApiError(response.status, `${method} ${endpoint} failed: ${response.status}`, responseBody);
    }

    if (!responseBody) {
      return {} as T;
    }

    try {
      return JSON.parse(responseBody) as T;
    } catch {
      throw new ApiError(0, `Invalid JSON response: ${method} ${endpoint}`);
    }
  }

  // ── User ──────────────────────────────────────────────────

  async getMe(): Promise<UserMeResponse> {
    return this.request<UserMeResponse>('GET', '/v1/user/me');
  }

  // ── Calls ─────────────────────────────────────────────────

  async initiateCall(params: InitiateCallParams): Promise<CallResponse> {
    return this.request<CallResponse>('POST', '/v1/calls', params);
  }

  async getCallStatus(callId: string): Promise<CallStatusResponse> {
    return this.request<CallStatusResponse>('GET', `/v1/calls/${callId}`);
  }

  async endCall(callId: string, reason?: string): Promise<void> {
    await this.request<void>('POST', `/v1/calls/${callId}/end`, reason ? { reason } : undefined);
  }

  // ── SMS ───────────────────────────────────────────────────

  async sendSms(params: SendSmsParams): Promise<SmsResponse> {
    return this.request<SmsResponse>('POST', '/v1/messages/send', params);
  }

  async listMessages(params?: ListMessagesParams): Promise<MessagesListResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.contact) query.set('contact', params.contact);
    if (params?.direction) query.set('direction', params.direction);
    const qs = query.toString();
    return this.request<MessagesListResponse>('GET', `/v1/messages${qs ? `?${qs}` : ''}`);
  }

  async listConversations(): Promise<ConversationsResponse> {
    return this.request<ConversationsResponse>('GET', '/v1/messages/conversations');
  }

  // ── Approvals ─────────────────────────────────────────────

  async createApproval(params: CreateApprovalParams): Promise<ApprovalResponse> {
    return this.request<ApprovalResponse>('POST', '/v1/approvals', params);
  }

  async getApprovalStatus(requestId: string): Promise<ApprovalStatusResponse> {
    return this.request<ApprovalStatusResponse>('GET', `/v1/approvals/${requestId}`);
  }

  // ── Missions ──────────────────────────────────────────────

  async createMission(params: CreateMissionParams): Promise<MissionResponse> {
    const result = await this.request<{ mission?: MissionResponse; data?: MissionResponse }>(
      'POST',
      '/missions',
      params,
    );
    return result.mission ?? result.data ?? (result as unknown as MissionResponse);
  }

  async getMission(missionId: string): Promise<MissionResponse> {
    const result = await this.request<MissionDetailResponse>('GET', `/missions/${missionId}`);
    return result.mission ?? (result as unknown as MissionResponse);
  }

  async listMissions(pageSize = 20): Promise<MissionResponse[]> {
    const result = await this.request<MissionListResponse>('GET', `/missions?page[size]=${pageSize}`);
    return result.missions ?? [];
  }

  // ── Runs ──────────────────────────────────────────────────

  async createRun(missionId: string, input: Record<string, unknown>): Promise<RunResponse> {
    const result = await this.request<{ data?: RunResponse }>('POST', `/missions/${missionId}/runs`, { input });
    return result.data ?? (result as unknown as RunResponse);
  }

  async getRun(missionId: string, runId: string): Promise<RunResponse> {
    const result = await this.request<{ data?: RunResponse }>('GET', `/missions/${missionId}/runs/${runId}`);
    return result.data ?? (result as unknown as RunResponse);
  }

  async updateRun(missionId: string, runId: string, updates: RunUpdateParams): Promise<void> {
    await this.request<unknown>('PATCH', `/missions/${missionId}/runs/${runId}`, updates);
  }

  async listRuns(missionId: string): Promise<RunResponse[]> {
    const result = await this.request<RunListResponse>('GET', `/missions/${missionId}/runs`);
    return result.data ?? [];
  }

  // ── Plans ─────────────────────────────────────────────────

  async createPlan(missionId: string, runId: string, steps: CreatePlanStepInput[]): Promise<PlanResponse> {
    const result = await this.request<{ data?: PlanResponse }>('POST', `/missions/${missionId}/runs/${runId}/plan`, {
      steps,
    });
    return result.data ?? (result as unknown as PlanResponse);
  }

  async getPlan(missionId: string, runId: string): Promise<PlanResponse> {
    const result = await this.request<{ data?: PlanResponse }>('GET', `/missions/${missionId}/runs/${runId}/plan`);
    return result.data ?? (result as unknown as PlanResponse);
  }

  async updateStep(missionId: string, runId: string, stepId: string, status: string): Promise<PlanStepResponse> {
    const result = await this.request<{ data?: PlanStepResponse }>(
      'PATCH',
      `/missions/${missionId}/runs/${runId}/plan/steps/${stepId}`,
      { status },
    );
    return result.data ?? (result as unknown as PlanStepResponse);
  }

  // ── Mission Events ────────────────────────────────────────

  async logEvent(missionId: string, runId: string, event: LogMissionEventParams): Promise<MissionEventResponse> {
    const result = await this.request<{ data?: MissionEventResponse }>(
      'POST',
      `/missions/${missionId}/runs/${runId}/events`,
      event,
    );
    return result.data ?? (result as unknown as MissionEventResponse);
  }

  async listEvents(missionId: string, runId: string): Promise<MissionEventResponse[]> {
    const result = await this.request<MissionEventListResponse>('GET', `/missions/${missionId}/runs/${runId}/events`);
    return result.data ?? [];
  }

  // ── Assistants ────────────────────────────────────────────

  async createAssistant(params: CreateAssistantParams): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>('POST', '/assistants', params);
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async getAssistant(assistantId: string): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>('GET', `/assistants/${assistantId}`);
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async updateAssistant(assistantId: string, updates: Record<string, unknown>): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>(
      'PATCH',
      `/assistants/${assistantId}`,
      updates,
    );
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async listAssistants(filter?: AssistantFilter): Promise<AssistantListResponse> {
    const query = new URLSearchParams();
    if (filter?.name) query.set('name', filter.name);
    const qs = query.toString();
    return this.request<AssistantListResponse>('GET', `/assistants${qs ? `?${qs}` : ''}`);
  }

  async getAssistantConnectionId(assistantId: string, feature = 'telephony'): Promise<string> {
    const result = await this.request<AssistantConnectionResponse>(
      'GET',
      `/assistants/${assistantId}/connection-id?feature=${feature}`,
    );
    return result.connection_id;
  }

  // ── Phone Numbers ─────────────────────────────────────────

  async getAvailablePhone(): Promise<PhoneResponse> {
    const result = await this.request<{ phone?: PhoneResponse }>('GET', '/numbers/account-phones/available');
    return result.phone ?? (result as unknown as PhoneResponse);
  }

  async assignPhone(phoneId: string, params: AssignPhoneParams): Promise<void> {
    await this.request<unknown>('PATCH', `/numbers/account-phones/${phoneId}`, params);
  }

  // ── Scheduled Events ──────────────────────────────────────

  async scheduleCall(params: ScheduleCallParams): Promise<ScheduledEventResponse> {
    return this.request<ScheduledEventResponse>('POST', `/assistants/${params.assistant_id}/scheduled-events`, {
      type: 'call',
      to: params.to,
      from: params.from,
      scheduled_at: params.scheduled_at,
      mission_id: params.mission_id,
      run_id: params.run_id,
    });
  }

  async scheduleSms(params: ScheduleSmsParams): Promise<ScheduledEventResponse> {
    return this.request<ScheduledEventResponse>('POST', `/assistants/${params.assistant_id}/scheduled-events`, {
      type: 'sms',
      to: params.to,
      from: params.from,
      scheduled_at: params.scheduled_at,
      message: params.message,
      mission_id: params.mission_id,
      run_id: params.run_id,
    });
  }

  async getScheduledEvent(assistantId: string, eventId: string): Promise<ScheduledEventDetailResponse> {
    return this.request<ScheduledEventDetailResponse>('GET', `/assistants/${assistantId}/scheduled-events/${eventId}`);
  }

  async cancelScheduledEvent(assistantId: string, eventId: string): Promise<void> {
    await this.request<void>('DELETE', `/assistants/${assistantId}/scheduled-events/${eventId}`);
  }

  // ── Insights ──────────────────────────────────────────────

  async getInsights(conversationId: string): Promise<InsightsResponse> {
    return this.request<InsightsResponse>('GET', `/v1/conversations/${conversationId}/insights`);
  }

  // ── Linked Agents ─────────────────────────────────────────

  async linkAgent(missionId: string, runId: string, agentId: string): Promise<void> {
    await this.request<unknown>('POST', `/missions/${missionId}/runs/${runId}/agents`, {
      telnyx_agent_id: agentId,
    });
  }

  async unlinkAgent(missionId: string, runId: string, agentId: string): Promise<void> {
    await this.request<void>('DELETE', `/missions/${missionId}/runs/${runId}/agents/${agentId}`);
  }

  async listLinkedAgents(missionId: string, runId: string): Promise<LinkedAgentsResponse> {
    return this.request<LinkedAgentsResponse>('GET', `/missions/${missionId}/runs/${runId}/agents`);
  }
}
