import { ENDPOINTS, resolve } from '../endpoints.js';
import type { CallEndResponse, CallResponse, CallStatusResponse, InitiateCallParams } from '../types.js';

export type RequestFn = <T>(method: string, endpoint: string, body?: unknown) => Promise<T>;

export class CallsNamespace {
  constructor(private readonly request: RequestFn) {}

  async initiate(params: InitiateCallParams): Promise<CallResponse> {
    return this.request<CallResponse>('POST', ENDPOINTS.initiateCall.path, params);
  }

  async status(callId: string): Promise<CallStatusResponse> {
    return this.request<CallStatusResponse>('GET', resolve(ENDPOINTS.getCallStatus.path, { callId }));
  }

  async end(callId: string, reason?: string): Promise<CallEndResponse> {
    return this.request<CallEndResponse>(
      'POST',
      resolve(ENDPOINTS.endCall.path, { callId }),
      reason ? { reason } : undefined,
    );
  }
}
