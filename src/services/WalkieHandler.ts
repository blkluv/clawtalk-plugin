/**
 * WalkieHandler — Push-to-talk (Clawdie-Talkie) request handler.
 *
 * On walkie_request: routes the transcript to an embedded agent turn
 * via CoreBridge, cleans the reply for voice, and sends a walkie_response
 * back via WebSocket.
 */

import type { Logger } from '../types/plugin.js';
import type { WsWalkieRequest } from '../types/websocket.js';
import type { ICoreBridge } from './CoreBridge.js';
import type { VoiceService } from './VoiceService.js';
import type { WebSocketService } from './WebSocketService.js';

const WALKIE_TIMEOUT_MS = 120_000;

const WALKIE_PREFIX =
  '[WALKIE-TALKIE] Push-to-talk message. Respond concisely for speech (1-3 sentences). No markdown, no lists, no URLs. ';

export class WalkieHandler {
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

  async handle(msg: WsWalkieRequest): Promise<void> {
    const { request_id: requestId, transcript, session_key: msgSessionKey } = msg;

    this.logger.info(`Walkie request [${requestId}]: ${transcript.substring(0, 100)}`);

    const sessionKey = msgSessionKey ?? 'clawtalk:walkie:default';

    try {
      const reply = await this.coreBridge.runAgentTurn({
        sessionKey,
        prompt: transcript,
        extraSystemPrompt: WALKIE_PREFIX + this.voiceService.buildContext(),
        timeoutMs: WALKIE_TIMEOUT_MS,
      });

      const cleanReply = !reply || reply.trim() === 'HEARTBEAT_OK' ? 'Done.' : this.voiceService.cleanForVoice(reply);

      this.sendResponse(requestId, cleanReply, undefined);
      this.logger.info(`Walkie complete [${requestId}]: ${cleanReply.substring(0, 100)}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error?.(`Walkie request failed [${requestId}]: ${errorMessage}`);
      this.sendResponse(requestId, undefined, `Request failed: ${errorMessage}`);
    }
  }

  // ── Private ─────────────────────────────────────────────

  private sendResponse(requestId: string, reply: string | undefined, error: string | undefined): void {
    try {
      this.ws.send({
        type: 'walkie_response',
        request_id: requestId,
        reply: reply ?? '',
        error,
      });
    } catch (err) {
      this.logger.error?.(`Failed to send walkie response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
