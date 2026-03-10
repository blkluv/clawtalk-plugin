/**
 * SmsTool — clawtalk_sms: Send an SMS message.
 * SmsListTool — clawtalk_sms_list: List recent messages.
 * SmsConversationsTool — clawtalk_sms_conversations: List conversations.
 */

import { Type } from '@sinclair/typebox';
import type { ClawTalkClient } from '../lib/clawtalk-sdk/index.js';
import type { Logger } from '../types/plugin.js';
import type {
  SmsConversationsToolResult,
  SmsListToolParams,
  SmsListToolResult,
  SmsToolParams,
  SmsToolResult,
} from '../types/tools.js';
import { ToolError } from '../utils/errors.js';
import { formatPhoneNumber } from '../utils/formatting.js';

// ── Schemas ─────────────────────────────────────────────────

export const SmsToolSchema = Type.Object({
  to: Type.String({ description: 'Phone number to send SMS to (E.164 format)' }),
  message: Type.String({ description: 'SMS message body' }),
  mediaUrls: Type.Optional(Type.Array(Type.String(), { description: 'Media URLs to attach (MMS)' })),
});

export const SmsListToolSchema = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Max messages to return. Default: 20' })),
  contact: Type.Optional(Type.String({ description: 'Filter by phone number' })),
  direction: Type.Optional(
    Type.Union([Type.Literal('inbound'), Type.Literal('outbound')], {
      description: 'Filter by direction',
    }),
  ),
});

export const SmsConversationsToolSchema = Type.Object({});

// ── Helpers ─────────────────────────────────────────────────

function formatResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ── SmsTool ─────────────────────────────────────────────────

export class SmsTool {
  private readonly client: ClawTalkClient;
  private readonly logger: Logger;

  readonly name = 'clawtalk_sms';
  readonly label = 'ClawTalk SMS';
  readonly description = 'Send an SMS (or MMS with media) to a phone number via ClawTalk.';
  readonly parameters = SmsToolSchema;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const params = raw as unknown as SmsToolParams;
    this.logger.info(`Sending SMS to ${params.to}`);

    try {
      const result = await this.client.sms.send({
        to: params.to,
        message: params.message,
        media_urls: params.mediaUrls,
      });

      const payload: SmsToolResult = {
        messageId: result.id,
        from: formatPhoneNumber(result.from ?? ''),
        status: result.status ?? 'sent',
        message: `SMS sent to ${formatPhoneNumber(params.to)}. Message ID: ${result.id}`,
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_sms', err);
    }
  }
}

// ── SmsListTool ─────────────────────────────────────────────

export class SmsListTool {
  private readonly client: ClawTalkClient;
  private readonly logger: Logger;

  readonly name = 'clawtalk_sms_list';
  readonly label = 'ClawTalk SMS List';
  readonly description = 'List recent SMS messages. Optionally filter by contact or direction.';
  readonly parameters = SmsListToolSchema;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const params = raw as unknown as SmsListToolParams;
    this.logger.info('Listing SMS messages');

    try {
      const result = await this.client.sms.list({
        limit: params.limit,
        contact: params.contact,
        direction: params.direction,
      });

      const messages = (result.messages ?? []).map((m) => ({
        from: formatPhoneNumber(m.from),
        to: formatPhoneNumber(m.to),
        body: m.body,
        direction: m.direction,
        createdAt: m.created_at,
      }));

      const payload: SmsListToolResult = {
        messages,
        total: messages.length,
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_sms_list', err);
    }
  }
}

// ── SmsConversationsTool ────────────────────────────────────

export class SmsConversationsTool {
  private readonly client: ClawTalkClient;
  private readonly logger: Logger;

  readonly name = 'clawtalk_sms_conversations';
  readonly label = 'ClawTalk SMS Conversations';
  readonly description = 'List all SMS conversations with recent activity.';
  readonly parameters = SmsConversationsToolSchema;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, _raw: Record<string, unknown>) {
    this.logger.info('Listing SMS conversations');

    try {
      const result = await this.client.sms.conversations();

      const conversations = (result.conversations ?? []).map((c) => ({
        contact: formatPhoneNumber(c.contact),
        lastMessage: c.last_message,
        lastMessageAt: c.last_message_at,
        unreadCount: c.unread_count ?? 0,
      }));

      const payload: SmsConversationsToolResult = {
        conversations,
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_sms_conversations', err);
    }
  }
}
