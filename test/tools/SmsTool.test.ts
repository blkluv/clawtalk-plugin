import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmsTool, SmsListTool, SmsConversationsTool } from '../../src/tools/SmsTool.js';
import type { ClawTalkClient } from '../../src/lib/clawtalk-sdk/index.js';
import type { Logger } from '../../src/types/plugin.js';

// ── Mocks ───────────────────────────────────────────────────

function createMockLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function createMockClient(overrides: Record<string, unknown> = {}): ClawTalkClient {
  return {
    sms: {
      send: vi.fn().mockResolvedValue({
        message_id: 'msg_456',
        from: '+15551234567',
        to: '+353851234567',
        status: 'sent',
      }),
      list: vi.fn().mockResolvedValue({
        messages: [
          {
            message_id: 'msg_1',
            from: '+15551234567',
            to: '+353851234567',
            body: 'Hello!',
            direction: 'outbound',
            status: 'delivered',
            created_at: '2026-03-09T12:00:00Z',
          },
          {
            message_id: 'msg_2',
            from: '+353851234567',
            to: '+15551234567',
            body: 'Hey!',
            direction: 'inbound',
            status: 'received',
            created_at: '2026-03-09T12:01:00Z',
          },
        ],
        total: 2,
      }),
      conversations: vi.fn().mockResolvedValue({
        conversations: [
          {
            contact: '+353851234567',
            last_message: 'See you later',
            last_message_at: '2026-03-09T12:05:00Z',
            unread_count: 1,
          },
        ],
      }),
      ...overrides,
    },
  } as unknown as ClawTalkClient;
}

// ── SmsTool ─────────────────────────────────────────────────

describe('SmsTool', () => {
  let tool: SmsTool;
  let client: ClawTalkClient;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    client = createMockClient();
    tool = new SmsTool({ client, logger });
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('clawtalk_sms');
    expect(tool.label).toBe('ClawTalk SMS');
  });

  it('sends SMS and returns formatted result', async () => {
    const result = await tool.execute('tc_1', { to: '+353851234567', message: 'Hello!' });

    expect(client.sms.send).toHaveBeenCalledWith({
      to: '+353851234567',
      message: 'Hello!',
      media_urls: undefined,
    });

    const details = result.details as Record<string, unknown>;
    expect(details.messageId).toBe('msg_456');
    expect(details.status).toBe('sent');
  });

  it('passes media URLs for MMS', async () => {
    await tool.execute('tc_2', {
      to: '+353851234567',
      message: 'Check this out',
      mediaUrls: ['https://example.com/img.jpg'],
    });

    expect(client.sms.send).toHaveBeenCalledWith({
      to: '+353851234567',
      message: 'Check this out',
      media_urls: ['https://example.com/img.jpg'],
    });
  });

  it('throws ToolError on API failure', async () => {
    const failClient = createMockClient({
      send: vi.fn().mockRejectedValue(new Error('Rate limited')),
    });
    const failTool = new SmsTool({ client: failClient, logger });

    await expect(failTool.execute('tc_3', { to: '+1', message: 'hi' })).rejects.toThrow('Rate limited');
  });
});

// ── SmsListTool ─────────────────────────────────────────────

describe('SmsListTool', () => {
  let tool: SmsListTool;
  let client: ClawTalkClient;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    client = createMockClient();
    tool = new SmsListTool({ client, logger });
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('clawtalk_sms_list');
  });

  it('lists messages with default params', async () => {
    const result = await tool.execute('tc_4', {});

    expect(client.sms.list).toHaveBeenCalledWith({
      limit: undefined,
      contact: undefined,
      direction: undefined,
    });

    const details = result.details as Record<string, unknown>;
    expect(details.total).toBe(2);
    expect((details.messages as unknown[]).length).toBe(2);
  });

  it('passes filter params', async () => {
    await tool.execute('tc_5', { limit: 5, contact: '+353851234567', direction: 'inbound' });

    expect(client.sms.list).toHaveBeenCalledWith({
      limit: 5,
      contact: '+353851234567',
      direction: 'inbound',
    });
  });
});

// ── SmsConversationsTool ────────────────────────────────────

describe('SmsConversationsTool', () => {
  let tool: SmsConversationsTool;
  let client: ClawTalkClient;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
    client = createMockClient();
    tool = new SmsConversationsTool({ client, logger });
  });

  it('has correct metadata', () => {
    expect(tool.name).toBe('clawtalk_sms_conversations');
  });

  it('lists conversations', async () => {
    const result = await tool.execute('tc_6', {});

    expect(client.sms.conversations).toHaveBeenCalled();

    const details = result.details as Record<string, unknown>;
    const convos = (details as { conversations: unknown[] }).conversations;
    expect(convos).toHaveLength(1);
    expect(convos[0]).toMatchObject({
      lastMessage: 'See you later',
      unreadCount: 1,
    });
  });
});
