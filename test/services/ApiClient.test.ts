import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from '../../src/services/ApiClient.js';
import { ApiError } from '../../src/utils/errors.js';
import type { ResolvedClawTalkConfig } from '../../src/config.js';
import type { Logger } from '../../src/types/plugin.js';

// ── Test helpers ────────────────────────────────────────────

const mockConfig: ResolvedClawTalkConfig = {
  enabled: true,
  apiKey: 'test_api_key_123',
  server: 'https://test.clawtalk.com',
  ownerName: 'Test User',
  agentName: 'TestBot',
  greeting: 'Hey there!',
  agentId: 'main',
  autoConnect: true,
  voiceContext: undefined,
  missions: {
    enabled: true,
    defaultVoice: undefined,
    defaultModel: undefined,
  },
};

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function mockFetchResponse(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  );
}

function mockFetchError(error: Error): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
}

// ── Tests ───────────────────────────────────────────────────

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient(mockConfig, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request basics', () => {
    it('sends correct headers', async () => {
      mockFetchResponse(200, { id: '1', email: 'test@test.com', name: 'Test', tier: 'pro', phone_number: null, created_at: '2026-01-01' });

      await client.getMe();

      expect(fetch).toHaveBeenCalledWith(
        'https://test.clawtalk.com/v1/user/me',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test_api_key_123',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('sends JSON body for POST requests', async () => {
      mockFetchResponse(200, { message_id: '1', from: '+1234', to: '+5678', status: 'sent' });

      await client.sendSms({ to: '+5678', message: 'Hello' });

      expect(fetch).toHaveBeenCalledWith(
        'https://test.clawtalk.com/v1/messages/send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ to: '+5678', message: 'Hello' }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('throws ApiError on 401', async () => {
      mockFetchResponse(401, { error: 'Unauthorized' });

      await expect(client.getMe()).rejects.toThrow(ApiError);
      await expect(client.getMe()).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws ApiError on 403', async () => {
      mockFetchResponse(403, { error: 'Forbidden' });

      await expect(client.getMe()).rejects.toThrow(ApiError);
      await expect(client.getMe()).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws ApiError on 404', async () => {
      mockFetchResponse(404, { error: 'Not found' });

      await expect(client.getCallStatus('nonexistent')).rejects.toThrow(ApiError);
      await expect(client.getCallStatus('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError on 429', async () => {
      mockFetchResponse(429, { error: 'Rate limited' });

      await expect(client.getMe()).rejects.toThrow(ApiError);
      await expect(client.getMe()).rejects.toMatchObject({ statusCode: 429 });
    });

    it('throws ApiError on 500', async () => {
      mockFetchResponse(500, { error: 'Internal server error' });

      await expect(client.getMe()).rejects.toThrow(ApiError);
      await expect(client.getMe()).rejects.toMatchObject({ statusCode: 500 });
    });

    it('throws ApiError on network error', async () => {
      mockFetchError(new Error('ECONNREFUSED'));

      await expect(client.getMe()).rejects.toThrow(ApiError);
      await expect(client.getMe()).rejects.toMatchObject({ statusCode: 0 });
    });

    it('throws ApiError on invalid JSON response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () => Promise.resolve('not json {{{'),
        }),
      );

      await expect(client.getMe()).rejects.toThrow(ApiError);
    });
  });

  describe('calls', () => {
    it('initiates a call', async () => {
      const response = { call_id: 'call_1', status: 'ringing', direction: 'outbound', from: '+1111', to: '+2222' };
      mockFetchResponse(200, response);

      const result = await client.initiateCall({ to: '+2222' });
      expect(result.call_id).toBe('call_1');
      expect(result.direction).toBe('outbound');
    });

    it('gets call status', async () => {
      const response = { call_id: 'call_1', status: 'answered', duration: 120 };
      mockFetchResponse(200, response);

      const result = await client.getCallStatus('call_1');
      expect(result.status).toBe('answered');
      expect(result.duration).toBe(120);
    });

    it('ends a call', async () => {
      mockFetchResponse(200, {});

      await expect(client.endCall('call_1', 'user_hangup')).resolves.not.toThrow();
    });
  });

  describe('SMS', () => {
    it('sends an SMS', async () => {
      const response = { message_id: 'msg_1', from: '+1111', to: '+2222', status: 'sent' };
      mockFetchResponse(200, response);

      const result = await client.sendSms({ to: '+2222', message: 'Hello' });
      expect(result.message_id).toBe('msg_1');
    });

    it('lists messages with filters', async () => {
      const response = { messages: [], total: 0 };
      mockFetchResponse(200, response);

      await client.listMessages({ limit: 10, direction: 'inbound' });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.anything(),
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('direction=inbound'),
        expect.anything(),
      );
    });

    it('lists conversations', async () => {
      const response = { conversations: [{ contact: '+2222', last_message: 'Hi', last_message_at: '2026-01-01', unread_count: 1 }] };
      mockFetchResponse(200, response);

      const result = await client.listConversations();
      expect(result.conversations).toHaveLength(1);
    });
  });

  describe('approvals', () => {
    it('creates an approval', async () => {
      const response = { request_id: 'req_1', status: 'pending' };
      mockFetchResponse(200, response);

      const result = await client.createApproval({ action: 'Send email' });
      expect(result.request_id).toBe('req_1');
      expect(result.status).toBe('pending');
    });

    it('gets approval status', async () => {
      const response = { request_id: 'req_1', status: 'approved', responded_at: '2026-01-01' };
      mockFetchResponse(200, response);

      const result = await client.getApprovalStatus('req_1');
      expect(result.status).toBe('approved');
    });
  });

  describe('missions', () => {
    it('creates a mission', async () => {
      const response = { mission: { id: 'm_1', name: 'Test', instructions: 'Do stuff', status: 'active', created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.createMission({ name: 'Test', instructions: 'Do stuff' });
      expect(result.id).toBe('m_1');
    });

    it('creates a run', async () => {
      const response = { data: { id: 'r_1', run_id: 'r_1', mission_id: 'm_1', status: 'pending', input: {}, created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.createRun('m_1', { query: 'test' });
      expect(result.id).toBe('r_1');
    });

    it('creates a plan', async () => {
      const response = { data: { steps: [{ id: 's_1', title: 'Step 1', status: 'pending', order: 0 }] } };
      mockFetchResponse(200, response);

      const result = await client.createPlan('m_1', 'r_1', [{ title: 'Step 1' }]);
      expect(result.steps).toHaveLength(1);
    });
  });
});
