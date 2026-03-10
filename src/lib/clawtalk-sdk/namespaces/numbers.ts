import { ENDPOINTS, resolve } from '../endpoints.js';
import type { AssignPhoneParams, PhoneResponse } from '../types.js';
import type { RequestFn } from './calls.js';

export class NumbersNamespace {
  constructor(private readonly request: RequestFn) {}

  async available(): Promise<PhoneResponse> {
    const result = await this.request<{ phone?: PhoneResponse }>('GET', ENDPOINTS.getAvailablePhone.path);
    return result.phone ?? (result as unknown as PhoneResponse);
  }

  async assign(phoneId: string, params: AssignPhoneParams): Promise<void> {
    await this.request<unknown>('PATCH', resolve(ENDPOINTS.assignPhoneNumber.path, { phoneId }), params);
  }
}
