import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallTool, CallStatusTool } from '../../src/tools/CallTool.js';
import type { ApiClient } from '../../src/services/ApiClient.js';
import type { Logger } from '../../src/types/plugin.js';

// ── Mocks ───────────────────────────────────────────────────

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function createMockApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    initiateCall: vi.fn().mockResolvedValue({
      call_id: 'call_123',
      status: 'initiated',
      direction: 'outbound',
      from: '+15551234567',
      to: '+353851234567',
    }),
    getCallStatus: vi.fn().mockResolvedValue({
      call_id: 'call_123',
      status: 'answered',
      duration: 45,
      transcript: 'Hello there.',
    }),
    endCall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ApiClient;
}

// ── CallTool ────────────────────────────────────────────────

describe('CallTool', () => {
  let tool: CallTool;
  let apiClient: ApiClient;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    apiClient = createMockApiClient();
    tool = new CallTool({ apiClient, logger });
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('clawtalk_call');
    expect(tool.label).toBe('ClawTalk Call');
    expect(tool.description).toBeTruthy();
  });

  it('initiates a call and returns formatted result', async () => {
    const result = await tool.execute('tc_1', { to: '+353851234567' });

    expect(apiClient.initiateCall).toHaveBeenCalledWith({
      to: '+353851234567',
      greeting: undefined,
      purpose: undefined,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.details).toMatchObject({
      callId: 'call_123',
      status: 'initiated',
    });
  });

  it('passes greeting and purpose', async () => {
    await tool.execute('tc_2', {
      to: '+353851234567',
      greeting: 'Hey there!',
      purpose: 'Check in',
    });

    expect(apiClient.initiateCall).toHaveBeenCalledWith({
      to: '+353851234567',
      greeting: 'Hey there!',
      purpose: 'Check in',
    });
  });

  it('throws ToolError on API failure', async () => {
    const failClient = createMockApiClient({
      initiateCall: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const failTool = new CallTool({ apiClient: failClient, logger });

    await expect(failTool.execute('tc_3', { to: '+1234' })).rejects.toThrow('Connection refused');
  });

  it('formats phone numbers in output', async () => {
    const result = await tool.execute('tc_4', { to: '+353851234567' });
    const details = result.details as Record<string, unknown>;

    // formatPhoneNumber should format the number
    expect(details.to).toBeTruthy();
    expect(details.from).toBeTruthy();
  });
});

// ── CallStatusTool ──────────────────────────────────────────

describe('CallStatusTool', () => {
  let tool: CallStatusTool;
  let apiClient: ApiClient;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    apiClient = createMockApiClient();
    tool = new CallStatusTool({ apiClient, logger });
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('clawtalk_call_status');
  });

  it('returns call status by default', async () => {
    const result = await tool.execute('tc_5', { callId: 'call_123' });

    expect(apiClient.getCallStatus).toHaveBeenCalledWith('call_123');

    const details = result.details as Record<string, unknown>;
    expect(details.status).toBe('answered');
    expect(details.duration).toBe(45);
    expect(details.transcript).toBe('Hello there.');
  });

  it('ends call when action is "end"', async () => {
    const result = await tool.execute('tc_6', { callId: 'call_123', action: 'end' });

    expect(apiClient.endCall).toHaveBeenCalledWith('call_123');

    const details = result.details as Record<string, unknown>;
    expect(details.status).toBe('ended');
  });

  it('throws ToolError on API failure', async () => {
    const failClient = createMockApiClient({
      getCallStatus: vi.fn().mockRejectedValue(new Error('Not found')),
    });
    const failTool = new CallStatusTool({ apiClient: failClient, logger });

    await expect(failTool.execute('tc_7', { callId: 'bad_id' })).rejects.toThrow('Not found');
  });
});
