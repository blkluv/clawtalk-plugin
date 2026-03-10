import { ENDPOINTS, resolve } from '../endpoints.js';
import type { InsightsResponse } from '../types.js';
import type { RequestFn } from './calls.js';

export class InsightsNamespace {
  constructor(private readonly request: RequestFn) {}

  async get(conversationId: string): Promise<InsightsResponse> {
    return this.request<InsightsResponse>('GET', resolve(ENDPOINTS.getInsights.path, { conversationId }));
  }
}
