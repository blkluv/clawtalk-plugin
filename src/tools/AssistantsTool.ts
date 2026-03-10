/**
 * AssistantsTool — CRUD operations on ClawTalk assistants (outside mission context).
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

export const AssistantsToolSchema = Type.Object({
  action: Type.Union([Type.Literal('list'), Type.Literal('get'), Type.Literal('create'), Type.Literal('update')], {
    description: 'Action to perform',
  }),
  assistantId: Type.Optional(Type.String({ description: 'Assistant ID (required for get/update)' })),
  name: Type.Optional(Type.String({ description: 'Assistant name (for create or list filter)' })),
  instructions: Type.Optional(Type.String({ description: 'Instructions (for create)' })),
  greeting: Type.Optional(Type.String({ description: 'Greeting (for create)' })),
  voice: Type.Optional(Type.String({ description: 'Voice model (for create)' })),
  model: Type.Optional(Type.String({ description: 'LLM model (for create)' })),
  updates: Type.Optional(Type.String({ description: 'JSON string of fields to update' })),
});

export class AssistantsTool {
  readonly name = 'clawtalk_assistants';
  readonly label = 'ClawTalk Assistants';
  readonly description = 'List, get, create, or update ClawTalk voice assistants.';
  readonly parameters = AssistantsToolSchema;

  private readonly client: ClawTalkClient;

  constructor(params: { client: ClawTalkClient; logger: Logger }) {
    this.client = params.client;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const action = raw.action as string;

    try {
      switch (action) {
        case 'list': {
          const result = await this.client.assistants.list(raw.name ? { name: raw.name as string } : undefined);
          return formatResult({
            data: result.assistants,
            message: `${result.assistants.length} assistant(s)`,
          });
        }
        case 'get': {
          const assistant = await this.client.assistants.get(raw.assistantId as string);
          return formatResult({ data: assistant, message: `Assistant: ${assistant.name}` });
        }
        case 'create': {
          const assistant = await this.client.assistants.create({
            name: raw.name as string,
            instructions: raw.instructions as string,
            greeting: raw.greeting as string | undefined,
            voice: raw.voice as string | undefined,
            model: raw.model as string | undefined,
          });
          return formatResult({ data: assistant, message: `Created assistant: ${assistant.id}` });
        }
        case 'update': {
          let updates: Record<string, unknown> = {};
          if (raw.updates) {
            try {
              updates = JSON.parse(raw.updates as string);
            } catch {
              updates = {};
            }
          }
          const assistant = await this.client.assistants.update(raw.assistantId as string, updates);
          return formatResult({ data: assistant, message: `Updated assistant: ${assistant.id}` });
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      throw ToolError.fromError('clawtalk_assistants', err);
    }
  }
}
