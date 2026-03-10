import { ENDPOINTS, resolve } from '../endpoints.js';
import type { ApprovalResponse, ApprovalStatusResponse, CreateApprovalParams } from '../types.js';
import type { RequestFn } from './calls.js';

export class ApprovalsNamespace {
  constructor(private readonly request: RequestFn) {}

  async create(params: CreateApprovalParams): Promise<ApprovalResponse> {
    return this.request<ApprovalResponse>('POST', ENDPOINTS.createApproval.path, params);
  }

  async status(requestId: string): Promise<ApprovalStatusResponse> {
    return this.request<ApprovalStatusResponse>('GET', resolve(ENDPOINTS.getApprovalStatus.path, { requestId }));
  }
}
