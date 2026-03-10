import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClawTalkClient, ApiError, ENDPOINTS } from '../../src/lib/clawtalk-sdk/index.js';

// ── Test helpers ────────────────────────────────────────────

const mockLogger = {
  debug: vi.fn(),
  warn: vi.fn(),
};

function createClient(): ClawTalkClient {
  return new ClawTalkClient({
    apiKey: 'test_api_key_123',
    server: 'https://test.clawtalk.com',
    logger: mockLogger,
  });
}

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

describe('ClawTalkClient', () => {
  let client: ClawTalkClient;

  beforeEach(() => {
    client = createClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request basics', () => {
    it('sends correct headers', async () => {
      mockFetchResponse(200, { user_id: '1', email: 'test@test.com', created_at: '2026-01-01' });

      await client.user.me();

      expect(fetch).toHaveBeenCalledWith(
        `https://test.clawtalk.com${ENDPOINTS.getMe.path}`,
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

      await client.sms.send({ to: '+5678', message: 'Hello' });

      expect(fetch).toHaveBeenCalledWith(
        `https://test.clawtalk.com${ENDPOINTS.sendSms.path}`,
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

      await expect(client.user.me()).rejects.toThrow(ApiError);
      await expect(client.user.me()).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws ApiError on 403', async () => {
      mockFetchResponse(403, { error: 'Forbidden' });

      await expect(client.user.me()).rejects.toThrow(ApiError);
      await expect(client.user.me()).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws ApiError on 404', async () => {
      mockFetchResponse(404, { error: 'Not found' });

      await expect(client.calls.status('nonexistent')).rejects.toThrow(ApiError);
      await expect(client.calls.status('nonexistent')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws ApiError on 429', async () => {
      mockFetchResponse(429, { error: 'Rate limited' });

      await expect(client.user.me()).rejects.toThrow(ApiError);
      await expect(client.user.me()).rejects.toMatchObject({ statusCode: 429 });
    });

    it('throws ApiError on 500', async () => {
      mockFetchResponse(500, { error: 'Internal server error' });

      await expect(client.user.me()).rejects.toThrow(ApiError);
      await expect(client.user.me()).rejects.toMatchObject({ statusCode: 500 });
    });

    it('throws ApiError on network error', async () => {
      mockFetchError(new Error('ECONNREFUSED'));

      await expect(client.user.me()).rejects.toThrow(ApiError);
      await expect(client.user.me()).rejects.toMatchObject({ statusCode: 0 });
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

      await expect(client.user.me()).rejects.toThrow(ApiError);
    });
  });

  describe('calls namespace', () => {
    it('initiates a call', async () => {
      const response = { call_id: 'call_1', status: 'ringing', direction: 'outbound', from: '+1111', to: '+2222' };
      mockFetchResponse(200, response);

      const result = await client.calls.initiate({ to: '+2222' });
      expect(result.call_id).toBe('call_1');
      expect(result.direction).toBe('outbound');
    });

    it('gets call status', async () => {
      const response = { call_id: 'call_1', status: 'answered', duration: 120 };
      mockFetchResponse(200, response);

      const result = await client.calls.status('call_1');
      expect(result.status).toBe('answered');
      expect(result.duration).toBe(120);
    });

    it('ends a call', async () => {
      mockFetchResponse(200, {});

      await expect(client.calls.end('call_1', 'user_hangup')).resolves.not.toThrow();
    });
  });

  describe('sms namespace', () => {
    it('sends an SMS', async () => {
      const response = { message_id: 'msg_1', from: '+1111', to: '+2222', status: 'sent' };
      mockFetchResponse(200, response);

      const result = await client.sms.send({ to: '+2222', message: 'Hello' });
      expect(result.message_id).toBe('msg_1');
    });

    it('lists messages with filters', async () => {
      const response = { messages: [], total: 0 };
      mockFetchResponse(200, response);

      await client.sms.list({ limit: 10, direction: 'inbound' });

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

      const result = await client.sms.conversations();
      expect(result.conversations).toHaveLength(1);
    });
  });

  describe('approvals namespace', () => {
    it('creates an approval', async () => {
      const response = { request_id: 'req_1', status: 'pending' };
      mockFetchResponse(200, response);

      const result = await client.approvals.create({ action: 'Send email' });
      expect(result.request_id).toBe('req_1');
      expect(result.status).toBe('pending');
    });

    it('gets approval status', async () => {
      const response = { request_id: 'req_1', status: 'approved', responded_at: '2026-01-01' };
      mockFetchResponse(200, response);

      const result = await client.approvals.status('req_1');
      expect(result.status).toBe('approved');
    });
  });

  describe('missions namespace', () => {
    it('creates a mission', async () => {
      const response = { mission: { id: 'm_1', name: 'Test', instructions: 'Do stuff', status: 'active', created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.missions.create({ name: 'Test', instructions: 'Do stuff' });
      expect(result.id).toBe('m_1');
    });

    it('lists missions', async () => {
      const response = { missions: [{ id: 'm_1', name: 'Test', instructions: 'Do stuff', status: 'active', created_at: '2026-01-01' }] };
      mockFetchResponse(200, response);

      const result = await client.missions.list();
      expect(result).toHaveLength(1);
    });

    it('creates a run', async () => {
      const response = { data: { id: 'r_1', run_id: 'r_1', mission_id: 'm_1', status: 'pending', input: {}, created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.missions.runs.create('m_1', { query: 'test' });
      expect(result.id).toBe('r_1');
    });

    it('creates a plan', async () => {
      const response = { data: { steps: [{ id: 's_1', title: 'Step 1', status: 'pending', order: 0 }] } };
      mockFetchResponse(200, response);

      const result = await client.missions.plans.create('m_1', 'r_1', [{ title: 'Step 1' }]);
      expect(result.steps).toHaveLength(1);
    });

    it('logs an event', async () => {
      const response = { data: { id: 'e_1', type: 'call', summary: 'Called target', created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.missions.events.log('m_1', 'r_1', { type: 'call', summary: 'Called target' });
      expect(result.id).toBe('e_1');
    });

    it('links an agent', async () => {
      mockFetchResponse(200, {});

      await expect(client.missions.agents.link('m_1', 'r_1', 'agent_1')).resolves.not.toThrow();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/missions/m_1/runs/r_1/agents'),
        expect.objectContaining({
          body: JSON.stringify({ telnyx_agent_id: 'agent_1' }),
        }),
      );
    });
  });

  describe('assistants namespace', () => {
    it('creates an assistant', async () => {
      const response = { assistant: { id: 'a_1', name: 'Bot', instructions: 'Help', greeting: null, voice: null, model: null, connection_id: null, created_at: '2026-01-01' } };
      mockFetchResponse(200, response);

      const result = await client.assistants.create({ name: 'Bot', instructions: 'Help' });
      expect(result.id).toBe('a_1');
    });

    it('gets connection ID', async () => {
      mockFetchResponse(200, { connection_id: 'conn_1' });

      const result = await client.assistants.connectionId('a_1');
      expect(result).toBe('conn_1');
    });

    it('schedules a call event', async () => {
      const response = { id: 'ev_1', type: 'call', status: 'scheduled', scheduled_at: '2026-01-02' };
      mockFetchResponse(200, response);

      const result = await client.assistants.events.schedule({
        assistant_id: 'a_1',
        to: '+1234',
        from: '+5678',
        scheduled_at: '2026-01-02T10:00:00Z',
      });
      expect(result.id).toBe('ev_1');
      expect(result.type).toBe('call');
    });
  });

  describe('user namespace', () => {
    it('gets current user', async () => {
      const response = { user_id: 'u_1', email: 'test@test.com', phone: null, phone_verified: false, subscription_tier: 'free', effective_tier: 'pro', effective_source: 'promo', effective_days_remaining: 29, subscription_status: 'inactive', paranoid_mode: false, voice_preference: null, system_number: null, dedicated_number: null, created_at: '2026-01-01', quota: { daily_call_seconds_limit: 30000, daily_calls_limit: 500, monthly_call_seconds_limit: 30000, monthly_messages_limit: 500, monthly_missions_limit: 100, monthly_mission_events_limit: 200, max_call_duration_seconds: 1800 } };
      mockFetchResponse(200, response);

      const result = await client.user.me();
      expect(result.user_id).toBe('u_1');
      expect(result.email).toBe('test@test.com');
    });
  });

  describe('numbers namespace', () => {
    it('gets available phone', async () => {
      const response = { phone: { id: 'p_1', phone_number: '+1111', hd_voice: true } };
      mockFetchResponse(200, response);

      const result = await client.numbers.available();
      expect(result.id).toBe('p_1');
    });

    it('assigns a phone', async () => {
      mockFetchResponse(200, {});

      await expect(client.numbers.assign('p_1', { connection_id: 'conn_1', type: 'sip' })).resolves.not.toThrow();
    });
  });

  describe('insights namespace', () => {
    it('gets insights', async () => {
      const response = { conversation_id: 'c_1', summary: 'Good call', sentiment: 'positive', key_topics: ['billing'], action_items: ['follow up'] };
      mockFetchResponse(200, response);

      const result = await client.insights.get('c_1');
      expect(result.summary).toBe('Good call');
      expect(result.key_topics).toContain('billing');
    });
  });
});
