import { ENDPOINTS, resolve } from '../endpoints.js';
import type {
  AssistantConnectionResponse,
  AssistantFilter,
  AssistantListResponse,
  AssistantResponse,
  CreateAssistantParams,
  ScheduleCallParams,
  ScheduledEventDetailResponse,
  ScheduledEventResponse,
  ScheduleSmsParams,
} from '../types.js';
import type { RequestFn } from './calls.js';

// ── Sub-namespace ───────────────────────────────────────────

class ScheduledEventsNamespace {
  constructor(private readonly request: RequestFn) {}

  async schedule(params: ScheduleCallParams | ScheduleSmsParams): Promise<ScheduledEventResponse> {
    const body: Record<string, unknown> = {
      to: params.to,
      from: params.from,
      scheduled_at: params.scheduled_at,
      mission_id: params.mission_id,
      run_id: params.run_id,
    };

    if ('message' in params) {
      body.type = 'sms';
      body.message = params.message;
    } else {
      body.type = 'call';
    }

    return this.request<ScheduledEventResponse>(
      'POST',
      resolve(ENDPOINTS.scheduleEvent.path, { assistantId: params.assistant_id }),
      body,
    );
  }

  async get(assistantId: string, eventId: string): Promise<ScheduledEventDetailResponse> {
    return this.request<ScheduledEventDetailResponse>(
      'GET',
      resolve(ENDPOINTS.getScheduledEvent.path, { assistantId, eventId }),
    );
  }

  async cancel(assistantId: string, eventId: string): Promise<void> {
    await this.request<void>('DELETE', resolve(ENDPOINTS.cancelScheduledEvent.path, { assistantId, eventId }));
  }
}

// ── Main namespace ──────────────────────────────────────────

export class AssistantsNamespace {
  readonly events: ScheduledEventsNamespace;

  constructor(private readonly request: RequestFn) {
    this.events = new ScheduledEventsNamespace(request);
  }

  async create(params: CreateAssistantParams): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>(
      'POST',
      ENDPOINTS.createAssistant.path,
      params,
    );
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async get(assistantId: string): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>(
      'GET',
      resolve(ENDPOINTS.getAssistant.path, { assistantId }),
    );
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async update(assistantId: string, updates: Record<string, unknown>): Promise<AssistantResponse> {
    const result = await this.request<{ assistant?: AssistantResponse }>(
      'PATCH',
      resolve(ENDPOINTS.updateAssistant.path, { assistantId }),
      updates,
    );
    return result.assistant ?? (result as unknown as AssistantResponse);
  }

  async list(filter?: AssistantFilter): Promise<AssistantListResponse> {
    const query = new URLSearchParams();
    if (filter?.name) query.set('name', filter.name);
    const qs = query.toString();
    return this.request<AssistantListResponse>('GET', `${ENDPOINTS.listAssistants.path}${qs ? `?${qs}` : ''}`);
  }

  async connectionId(assistantId: string, feature = 'telephony'): Promise<string> {
    const result = await this.request<AssistantConnectionResponse>(
      'GET',
      `${resolve(ENDPOINTS.getConnectionId.path, { assistantId })}?feature=${feature}`,
    );
    return result.connection_id;
  }
}
