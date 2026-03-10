import { ENDPOINTS } from '../endpoints.js';
import type {
  ConversationsResponse,
  ListMessagesParams,
  MessagesListResponse,
  SendSmsParams,
  SmsResponse,
} from '../types.js';
import type { RequestFn } from './calls.js';

export class SmsNamespace {
  constructor(private readonly request: RequestFn) {}

  async send(params: SendSmsParams): Promise<SmsResponse> {
    return this.request<SmsResponse>('POST', ENDPOINTS.sendSms.path, params);
  }

  async list(params?: ListMessagesParams): Promise<MessagesListResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.contact) query.set('contact', params.contact);
    if (params?.direction) query.set('direction', params.direction);
    const qs = query.toString();
    return this.request<MessagesListResponse>('GET', `${ENDPOINTS.listMessages.path}${qs ? `?${qs}` : ''}`);
  }

  async conversations(): Promise<ConversationsResponse> {
    return this.request<ConversationsResponse>('GET', ENDPOINTS.listConversations.path);
  }
}
