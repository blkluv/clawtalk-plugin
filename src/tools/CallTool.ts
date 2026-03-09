/**
 * CallTool — clawtalk_call: Initiate an outbound phone call.
 * CallStatusTool — clawtalk_call_status: Check call status or end a call.
 */

import { Type } from '@sinclair/typebox';
import type { ClawTalkClient } from '../lib/clawtalk-sdk/index.js';
import type { Logger } from '../types/plugin.js';
import type { CallStatusToolParams, CallStatusToolResult, CallToolParams, CallToolResult } from '../types/tools.js';
import { ToolError } from '../utils/errors.js';
import { formatPhoneNumber } from '../utils/formatting.js';

// ── Schemas ─────────────────────────────────────────────────

export const CallToolSchema = Type.Object({
  to: Type.String({ description: 'Phone number to call (E.164 format, e.g. +353851234567)' }),
  greeting: Type.Optional(Type.String({ description: 'Custom greeting message spoken when the call connects' })),
  purpose: Type.Optional(Type.String({ description: 'Purpose of the call (for context/logging)' })),
});

export const CallStatusToolSchema = Type.Object({
  callId: Type.String({ description: 'The call ID returned from clawtalk_call' }),
  action: Type.Optional(
    Type.Union([Type.Literal('status'), Type.Literal('end')], {
      description: 'Action to perform. Default: status',
    }),
  ),
});

// ── Helpers ─────────────────────────────────────────────────

function formatResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ── CallTool ────────────────────────────────────────────────

export class CallTool {
  private readonly client: ClawTalkClient;
  private readonly logger: Logger;

  readonly name = 'clawtalk_call';
  readonly label = 'ClawTalk Call';
  readonly description =
    'Initiate an outbound phone call via ClawTalk. The call connects to the ClawTalk voice AI which can have a conversation with the recipient.';
  readonly parameters = CallToolSchema;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const params = raw as unknown as CallToolParams;
    this.logger.info(`Initiating call to ${params.to}`);

    try {
      const result = await this.client.calls.initiate({
        to: params.to,
        greeting: params.greeting,
        purpose: params.purpose,
      });

      const payload: CallToolResult = {
        callId: result.call_id,
        status: result.status ?? 'initiated',
        from: formatPhoneNumber(result.from ?? ''),
        to: formatPhoneNumber(params.to),
        message: `Call initiated to ${formatPhoneNumber(params.to)}. Call ID: ${result.call_id}`,
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_call', err);
    }
  }
}

// ── CallStatusTool ──────────────────────────────────────────

export class CallStatusTool {
  private readonly client: ClawTalkClient;
  private readonly logger: Logger;

  readonly name = 'clawtalk_call_status';
  readonly label = 'ClawTalk Call Status';
  readonly description = 'Check the status of an active call or end it. Use action "end" to hang up.';
  readonly parameters = CallStatusToolSchema;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const params = raw as unknown as CallStatusToolParams;
    const action = params.action ?? 'status';

    try {
      if (action === 'end') {
        this.logger.info(`Ending call ${params.callId}`);
        await this.client.calls.end(params.callId);

        const payload: CallStatusToolResult = {
          callId: params.callId,
          status: 'ended',
          message: `Call ${params.callId} ended.`,
        };
        return formatResult(payload);
      }

      this.logger.info(`Checking status of call ${params.callId}`);
      const result = await this.client.calls.status(params.callId);

      const payload: CallStatusToolResult = {
        callId: params.callId,
        status: result.status ?? 'unknown',
        duration: result.duration,
        transcript: result.transcript,
        message: `Call ${params.callId}: ${result.status ?? 'unknown'}${result.duration ? ` (${result.duration}s)` : ''}`,
      };
      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_call_status', err);
    }
  }
}
