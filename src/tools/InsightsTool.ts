/**
 * InsightsTool — retrieve conversation insights from Telnyx via ClawTalk proxy.
 */

import { Type } from '@sinclair/typebox';
import type { ClawTalkClient } from '../lib/clawtalk-sdk/index.js';
import type { Logger } from '../types/plugin.js';
import { ToolError } from '../utils/errors.js';

function formatResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

export const InsightsToolSchema = Type.Object({
  conversationId: Type.String({ description: 'Telnyx conversation ID (from a completed call event)' }),
});

export class InsightsTool {
  readonly name = 'clawtalk_insights';
  readonly label = 'ClawTalk Insights';
  readonly description = 'Get AI-generated insights from a Telnyx conversation (summary, sentiment, topics).';
  readonly parameters = InsightsToolSchema;

  private readonly client: ClawTalkClient;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    try {
      const result = await this.client.insights.get(raw.conversationId as string);
      return formatResult({
        data: result,
        message: `Insights retrieved for conversation ${raw.conversationId}`,
      });
    } catch (err) {
      throw ToolError.fromError('clawtalk_insights', err);
    }
  }
}
