/**
 * DeepToolHandler — Routes voice AI deep tool requests to the agent.
 *
 * When the Telnyx Voice AI Assistant needs to perform a complex action
 * (tool calls, lookups, etc.), it fires a deep_tool_request via WebSocket.
 * This handler runs an embedded agent turn via CoreBridge and sends the
 * cleaned voice-safe result back.
 *
 * No client-side approval pre-check: Lakera Guard handles input screening
 * server-side before the request reaches us.
 */

import type { Logger } from '../types/plugin.js';
import type { WsDeepToolRequest } from '../types/websocket.js';
import type { ICoreBridge } from './CoreBridge.js';
import type { VoiceService } from './VoiceService.js';
import type { WebSocketService } from './WebSocketService.js';

const DEEP_TOOL_TIMEOUT_MS = 120_000;

const VOICE_PREFIX =
  '[VOICE CALL] Respond concisely for speech. No markdown, no lists, no URLs. Do NOT request approval — it has already been handled. Just perform the action directly. ';

export class DeepToolHandler {
  private readonly ws: WebSocketService;
  private readonly coreBridge: ICoreBridge;
  private readonly voiceService: VoiceService;
  private readonly logger: Logger;

  constructor(params: {
    ws: WebSocketService;
    coreBridge: ICoreBridge;
    voiceService: VoiceService;
    logger: Logger;
  }) {
    this.ws = params.ws;
    this.coreBridge = params.coreBridge;
    this.voiceService = params.voiceService;
    this.logger = params.logger;
  }

  async handle(msg: WsDeepToolRequest): Promise<void> {
    const { request_id: requestId, call_id: callId, query } = msg;

    this.logger.info(`Deep tool request [${requestId}]: ${query.substring(0, 100)}`);

    const sessionKey = `clawtalk:call:${callId}`;

    try {
      const reply = await this.coreBridge.runAgentTurn({
        sessionKey,
        prompt: VOICE_PREFIX + query,
        extraSystemPrompt: this.voiceService.buildContext(),
        timeoutMs: DEEP_TOOL_TIMEOUT_MS,
      });

      const cleanReply = this.processReply(reply);
      this.sendResult(requestId, callId, cleanReply);
      this.logger.info(`Deep tool complete [${requestId}]: ${cleanReply.substring(0, 100)}`);
    } catch (err) {
      const errorMessage = this.mapError(err);
      this.sendResult(requestId, callId, errorMessage);
      this.logger.error?.(`Deep tool failed [${requestId}]: ${errorMessage}`);
    }
  }

  // ── Private ─────────────────────────────────────────────

  private processReply(reply: string | null): string {
    if (!reply || reply.trim() === 'HEARTBEAT_OK') {
      return 'Done.';
    }
    return this.voiceService.cleanForVoice(reply);
  }

  private mapError(err: unknown): string {
    if (!(err instanceof Error)) return 'Agent execution failed.';

    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
      return 'That took too long. Try asking again.';
    }
    if (msg.includes('core_bridge_unavailable') || msg.includes('corebridge')) {
      return 'Agent system is unavailable right now.';
    }
    return 'Agent execution failed.';
  }

  private sendResult(requestId: string, callId: string, text: string): void {
    try {
      this.ws.send({
        type: 'deep_tool_result',
        call_id: callId,
        request_id: requestId,
        text,
      });
    } catch (err) {
      this.logger.error?.(`Failed to send deep tool result: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
