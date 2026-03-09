/**
 * ApprovalManager — Push notification approval lifecycle.
 *
 * Creates approval requests via the ClawTalk API, then waits for
 * the user's decision to arrive via WebSocket (no polling).
 *
 * Fixes the old ws-client.js bug: pendingApprovals Map is properly
 * initialized in the constructor.
 */

import type { Logger } from '../types/plugin.js';
import type { WsApprovalResponded } from '../types/websocket.js';
import type { ApiClient } from './ApiClient.js';

// ── Types ───────────────────────────────────────────────────

export type ApprovalDecision = 'approved' | 'denied' | 'timeout' | 'no_devices' | 'no_devices_reached';

export interface ApprovalOptions {
  details?: string;
  biometric?: boolean;
  timeout?: number;
}

interface PendingApproval {
  resolve: (decision: ApprovalDecision) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ── Manager ─────────────────────────────────────────────────

const DEFAULT_TIMEOUT_S = 60;

export class ApprovalManager {
  private readonly apiClient: ApiClient;
  private readonly logger: Logger;
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  constructor(params: { apiClient: ApiClient; logger: Logger }) {
    this.apiClient = params.apiClient;
    this.logger = params.logger;
  }

  /**
   * Create an approval request and wait for the user's decision via WebSocket.
   * Returns the decision string. Does NOT poll — relies entirely on WS notification.
   */
  async requestApproval(action: string, options?: ApprovalOptions): Promise<ApprovalDecision> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_S;

    this.logger.info(`Requesting approval: ${action}`);

    const result = await this.apiClient.createApproval({
      action,
      details: options?.details,
      require_biometric: options?.biometric ?? false,
      expires_in: timeout,
    });

    const requestId = result.request_id;
    const devicesNotified = result.devices_notified ?? 0;
    const devicesFailed = result.devices_failed ?? 0;

    this.logger.info(`Approval created: ${requestId} (notified: ${devicesNotified}, failed: ${devicesFailed})`);

    // No devices available — return immediately
    if (devicesNotified === 0) {
      if (devicesFailed > 0) return 'no_devices_reached';
      return 'no_devices';
    }

    // Wait for WebSocket response with timeout
    const decision = await this.waitForDecision(requestId, timeout * 1000);

    this.logger.info(`Approval result: ${decision}`);
    return decision;
  }

  /**
   * Handle an approval.responded WebSocket event.
   * Resolves the pending promise if one exists for the request ID.
   */
  handleWebSocketResponse(msg: WsApprovalResponded): void {
    const { request_id: requestId, decision } = msg;

    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      this.logger.debug?.(`Approval response for unknown/expired request: ${requestId}`);
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingApprovals.delete(requestId);
    pending.resolve(decision as ApprovalDecision);
  }

  /**
   * Reject all pending approvals. Call on WebSocket disconnect
   * so callers aren't left hanging indefinitely.
   */
  cleanupPending(): void {
    for (const [requestId, pending] of this.pendingApprovals) {
      clearTimeout(pending.timeoutId);
      pending.resolve('timeout');
      this.logger.debug?.(`Cleaned up pending approval: ${requestId}`);
    }
    this.pendingApprovals.clear();
  }

  /**
   * Number of currently pending approval requests.
   */
  get pendingCount(): number {
    return this.pendingApprovals.size;
  }

  // ── Private ─────────────────────────────────────────────

  private waitForDecision(requestId: string, timeoutMs: number): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingApprovals.delete(requestId);
        resolve('timeout');
      }, timeoutMs);

      this.pendingApprovals.set(requestId, { resolve, timeoutId });
    });
  }
}
