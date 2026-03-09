import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalManager } from '../../src/services/ApprovalManager.js';
import type { ApiClient } from '../../src/services/ApiClient.js';
import type { Logger } from '../../src/types/plugin.js';
import type { WsApprovalResponded } from '../../src/types/websocket.js';

// ── Helpers ─────────────────────────────────────────────────

/** Yield to the microtask queue so async callbacks settle */
const tick = () => new Promise<void>((r) => queueMicrotask(r));

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockApiClient(overrides?: Partial<{ devices_notified: number; devices_failed: number }>): ApiClient {
  return {
    createApproval: vi.fn().mockResolvedValue({
      request_id: 'req_123',
      status: 'pending',
      devices_notified: overrides?.devices_notified ?? 1,
      devices_failed: overrides?.devices_failed ?? 0,
    }),
  } as unknown as ApiClient;
}

function wsResponse(requestId: string, decision: WsApprovalResponded['decision']): WsApprovalResponded {
  return { type: 'event', event: 'approval.responded', request_id: requestId, decision };
}

// ── Tests ───────────────────────────────────────────────────

describe('ApprovalManager', () => {
  let manager: ApprovalManager;
  let apiClient: ApiClient;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    apiClient = createMockApiClient();
    logger = createMockLogger();
    manager = new ApprovalManager({ apiClient, logger });
  });

  afterEach(() => {
    manager.cleanupPending();
    vi.useRealTimers();
  });

  it('resolves with "approved" when WS response arrives', async () => {
    const promise = manager.requestApproval('Delete repo');
    await tick(); // let createApproval resolve + waitForDecision register

    manager.handleWebSocketResponse(wsResponse('req_123', 'approved'));

    expect(await promise).toBe('approved');
  });

  it('resolves with "denied" when user denies', async () => {
    const promise = manager.requestApproval('Send email');
    await tick();

    manager.handleWebSocketResponse(wsResponse('req_123', 'denied'));

    expect(await promise).toBe('denied');
  });

  it('resolves with "timeout" when no response within timeout', async () => {
    const promise = manager.requestApproval('Delete file', { timeout: 5 });
    await tick();

    vi.advanceTimersByTime(6000);

    expect(await promise).toBe('timeout');
  });

  it('returns "no_devices" when devices_notified is 0 and no failures', async () => {
    apiClient = createMockApiClient({ devices_notified: 0, devices_failed: 0 });
    manager = new ApprovalManager({ apiClient, logger });

    const result = await manager.requestApproval('Test action');
    expect(result).toBe('no_devices');
  });

  it('returns "no_devices_reached" when devices_notified is 0 but devices_failed > 0', async () => {
    apiClient = createMockApiClient({ devices_notified: 0, devices_failed: 2 });
    manager = new ApprovalManager({ apiClient, logger });

    const result = await manager.requestApproval('Test action');
    expect(result).toBe('no_devices_reached');
  });

  it('ignores WS response for unknown request ID', () => {
    manager.handleWebSocketResponse(wsResponse('unknown_id', 'approved'));
    expect(logger.debug).toHaveBeenCalled();
  });

  it('ignores duplicate WS response for already-resolved request', async () => {
    const promise = manager.requestApproval('Action');
    await tick();

    manager.handleWebSocketResponse(wsResponse('req_123', 'approved'));
    await promise;

    // Second response for same ID — should not throw
    manager.handleWebSocketResponse(wsResponse('req_123', 'denied'));
    expect(manager.pendingCount).toBe(0);
  });

  it('cleans up all pending approvals on disconnect', async () => {
    const promise1 = manager.requestApproval('Action 1');
    await tick();

    (apiClient.createApproval as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      request_id: 'req_456',
      status: 'pending',
      devices_notified: 1,
      devices_failed: 0,
    });
    const promise2 = manager.requestApproval('Action 2');
    await tick();

    expect(manager.pendingCount).toBe(2);

    manager.cleanupPending();

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe('timeout');
    expect(result2).toBe('timeout');
    expect(manager.pendingCount).toBe(0);
  });

  it('calls apiClient.createApproval with correct params', async () => {
    const promise = manager.requestApproval('Deploy to prod', {
      details: 'Deploying v2.0',
      biometric: true,
      timeout: 30,
    });
    await tick();

    manager.handleWebSocketResponse(wsResponse('req_123', 'approved'));
    await promise;

    expect(apiClient.createApproval).toHaveBeenCalledWith({
      action: 'Deploy to prod',
      details: 'Deploying v2.0',
      require_biometric: true,
      expires_in: 30,
    });
  });
});
