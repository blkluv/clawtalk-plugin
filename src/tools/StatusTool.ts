/**
 * StatusTool — clawtalk_status: Check connection status, version, and health.
 */

import { Type } from '@sinclair/typebox';
import type { ResolvedClawTalkConfig } from '../config.js';
import type { ClawTalkClient } from '../lib/clawtalk-sdk/index.js';
import type { WebSocketService } from '../services/WebSocketService.js';
import type { Logger } from '../types/plugin.js';
import type { StatusToolResult } from '../types/tools.js';
import { ToolError } from '../utils/errors.js';

// ── Schema ──────────────────────────────────────────────────

export const StatusToolSchema = Type.Object({});

// ── Helpers ─────────────────────────────────────────────────

function formatResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

// ── StatusTool ──────────────────────────────────────────────

export class StatusTool {
  private readonly config: ResolvedClawTalkConfig;
  private readonly client: ClawTalkClient;
  private readonly ws: WebSocketService;
  private readonly logger: Logger;

  readonly name = 'clawtalk_status';
  readonly label = 'ClawTalk Status';
  readonly description =
    'Check ClawTalk connection status, version, server URL, authenticated user, and WebSocket health.';
  readonly parameters = StatusToolSchema;

  constructor(params: {
    config: ResolvedClawTalkConfig;
    client: ClawTalkClient;
    ws: WebSocketService;
    logger: Logger;
  }) {
    this.config = params.config;
    this.client = params.client;
    this.ws = params.ws;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, _raw: Record<string, unknown>) {
    this.logger.info('Checking ClawTalk status');

    try {
      // Try to get authenticated user info
      let userName: string | undefined;
      try {
        const me = await this.client.user.me();
        userName = me.email ?? undefined;
      } catch {
        // API key might be invalid, still report other status
      }

      const connected = this.ws.isConnected;
      const lastPing = this.ws.lastPing;
      const lastPong = this.ws.lastPong;

      const parts: string[] = [];
      parts.push(`WebSocket: ${connected ? 'connected' : 'disconnected'}`);
      parts.push(`Server: ${this.config.server}`);
      parts.push(`Version: ${this.ws.version}`);
      if (userName) parts.push(`User: ${userName}`);
      if (lastPing) parts.push(`Last ping: ${lastPing.toISOString()}`);
      if (lastPong) parts.push(`Last pong: ${lastPong.toISOString()}`);

      const payload: StatusToolResult = {
        connected,
        server: this.config.server,
        version: this.ws.version,
        user: userName,
        websocketState: connected ? 'open' : 'closed',
        lastPingAt: lastPing?.toISOString(),
        lastPongAt: lastPong?.toISOString(),
        message: parts.join('. '),
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_status', err);
    }
  }
}
