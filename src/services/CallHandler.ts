/**
 * CallHandler — Call lifecycle management.
 *
 * Handles context_request (provide voice context + greeting at call start),
 * call.started (track conversation, send greeting for inbound),
 * and call.ended (cleanup, report outcome via system event).
 *
 * Call outcome reports are fire-and-forget system events to the main session
 * (not agent turns) so the user sees a summary in their chat.
 */

import type { ResolvedClawTalkConfig } from '../config.js';
import type { Logger } from '../types/plugin.js';
import type { WsCallEnded, WsCallStarted, WsContextRequest } from '../types/websocket.js';
import { formatDuration, formatPhoneNumber } from '../utils/formatting.js';
import type { ICoreBridge } from './CoreBridge.js';
import type { VoiceService } from './VoiceService.js';
import type { WebSocketService } from './WebSocketService.js';

interface CallState {
  greeted: boolean;
}

export class CallHandler {
  private readonly config: ResolvedClawTalkConfig;
  private readonly ws: WebSocketService;
  private readonly voiceService: VoiceService;
  private readonly coreBridge: ICoreBridge;
  private readonly logger: Logger;
  private readonly conversations = new Map<string, CallState>();

  constructor(params: {
    config: ResolvedClawTalkConfig;
    ws: WebSocketService;
    voiceService: VoiceService;
    coreBridge: ICoreBridge;
    logger: Logger;
  }) {
    this.config = params.config;
    this.ws = params.ws;
    this.voiceService = params.voiceService;
    this.coreBridge = params.coreBridge;
    this.logger = params.logger;
  }

  handleContextRequest(msg: WsContextRequest): void {
    const { call_id: callId } = msg;

    this.logger.info(`Call started (context_request): ${callId}`);
    this.conversations.set(callId, { greeted: true });

    // Send context response
    try {
      this.ws.send({
        type: 'context_response',
        call_id: callId,
        context: {
          memory: 'Voice call with full agent capabilities. Tools available: Slack messaging, web search, and more.',
          system_prompt: this.voiceService.buildContext(),
        },
      });
      this.logger.info(`Context sent for call: ${callId}`);
    } catch (err) {
      this.logger.error?.(`Failed to send context: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Send greeting
    this.sendGreeting(callId);
  }

  handleCallStarted(msg: WsCallStarted): void {
    const { call_id: callId, direction } = msg;

    if (!this.conversations.has(callId)) {
      this.conversations.set(callId, { greeted: false });
    }

    this.logger.info(`Call started: ${callId} direction=${direction}`);

    const state = this.conversations.get(callId);
    if (direction === 'inbound' && state && !state.greeted) {
      this.sendGreeting(callId);
      state.greeted = true;
    }
  }

  handleCallEnded(msg: WsCallEnded): void {
    const { call_id: callId } = msg;

    this.conversations.delete(callId);
    this.logger.info(`Call ended: ${callId}`);

    this.reportOutcome(msg);
  }

  // ── Private ─────────────────────────────────────────────

  private sendGreeting(callId: string): void {
    try {
      this.ws.send({
        type: 'response',
        call_id: callId,
        text: this.voiceService.greeting,
      });
      this.logger.info('Greeting sent');
    } catch (err) {
      this.logger.error?.(`Failed to send greeting: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private reportOutcome(event: WsCallEnded): void {
    const summary = this.buildOutcomeSummary(event);
    if (!summary) return;

    const mainSessionKey = `agent:${this.config.agentId}:main`;
    try {
      this.coreBridge.enqueueSystemEvent(`[ClawTalk] ${summary}`, mainSessionKey);
      this.logger.info('Call outcome reported via system event');
    } catch (err) {
      this.logger.warn?.(`Failed to report call outcome: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Build a human-readable call outcome summary.
   * Ported from ws-client.js reportCallOutcome() lines 870-930.
   */
  private buildOutcomeSummary(event: WsCallEnded): string | null {
    const direction = event.direction ?? 'unknown';
    const duration = event.duration_seconds ?? 0;
    const reason = event.reason ?? 'unknown';
    const { outcome, to_number: toNumber, purpose, greeting, voicemail_message: voicemailMessage } = event;

    if (direction === 'outbound') {
      const target = toNumber ? formatPhoneNumber(toNumber) : 'unknown number';

      if (outcome === 'voicemail') {
        let summary = `📬 **Voicemail left** for ${target}`;
        if (voicemailMessage) {
          const truncated =
            voicemailMessage.length > 200 ? `${voicemailMessage.substring(0, 200)}...` : voicemailMessage;
          summary += `\n> "${truncated}"`;
        }
        return summary;
      }

      if (outcome === 'voicemail_failed') {
        return `📵 Call to ${target} went to voicemail but couldn't leave message (no beep detected)`;
      }

      if (outcome === 'no_answer' || reason === 'amd_silence') {
        return `📵 Call to ${target} - no answer (silence detected)`;
      }

      if (outcome === 'fax') {
        return `📠 Call to ${target} - fax machine detected, call ended`;
      }

      if (reason === 'user_hangup') {
        let summary = `✅ Call to ${target} completed (${formatDuration(duration)})`;
        if (purpose || greeting) {
          summary += `\n📋 Purpose: ${(purpose ?? greeting ?? '').substring(0, 100)}`;
        }
        return summary;
      }

      let summary = `📞 Call to ${target} ended: ${reason} (${formatDuration(duration)})`;
      if (purpose || greeting) {
        summary += `\n📋 Purpose: ${(purpose ?? greeting ?? '').substring(0, 100)}`;
      }
      return summary;
    }

    if (direction === 'inbound') {
      return `📞 Inbound call ended (${formatDuration(duration)})`;
    }

    return `📞 Call ended: ${reason}`;
  }
}
