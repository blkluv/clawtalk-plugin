/**
 * Tool registry — registers all Phase 4 agent tools with the OpenClaw plugin API.
 *
 * Each tool is a class instance with name, label, description, parameters (TypeBox schema),
 * and an execute() method returning { content: [{ type: "text", text }], details }.
 */

import type { ResolvedClawTalkConfig } from '../config.js';
import type { ApiClient } from '../services/ApiClient.js';
import type { ApprovalManager } from '../services/ApprovalManager.js';
import type { WebSocketService } from '../services/WebSocketService.js';
import type { Logger } from '../types/plugin.js';
import { ApproveTool } from './ApproveTool.js';
import { CallStatusTool, CallTool } from './CallTool.js';
import { SmsConversationsTool, SmsListTool, SmsTool } from './SmsTool.js';
import { StatusTool } from './StatusTool.js';

// ── Service container for tool construction ─────────────────

export interface ToolServices {
  readonly config: ResolvedClawTalkConfig;
  readonly apiClient: ApiClient;
  readonly approvalManager: ApprovalManager;
  readonly ws: WebSocketService;
  readonly logger: Logger;
}

// ── Tool interface matching api.registerTool() shape ────────

export interface ClawTalkTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: unknown;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: unknown;
  }>;
}

// ── Registry ────────────────────────────────────────────────

export function createTools(services: ToolServices): ClawTalkTool[] {
  const { config, apiClient, approvalManager, ws, logger } = services;

  return [
    new CallTool({ apiClient, logger }),
    new CallStatusTool({ apiClient, logger }),
    new SmsTool({ apiClient, logger }),
    new SmsListTool({ apiClient, logger }),
    new SmsConversationsTool({ apiClient, logger }),
    new ApproveTool({ approvalManager, logger }),
    new StatusTool({ config, apiClient, ws, logger }),
  ];
}

/**
 * Register all ClawTalk tools with the OpenClaw plugin API.
 */
export function registerTools(
  api: { registerTool: (tool: Record<string, unknown>) => void },
  services: ToolServices,
): void {
  const tools = createTools(services);

  for (const tool of tools) {
    api.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      execute: tool.execute.bind(tool),
    });
  }

  services.logger.info(`Registered ${tools.length} agent tools`);
}
