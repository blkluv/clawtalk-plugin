/**
 * VoiceService — Voice context builder and TTS text cleanup.
 *
 * Builds the system prompt injected into voice agent sessions.
 * Ports the full DEFAULT_VOICE_CONTEXT from ws-client.js with drip
 * progress rules, approval instructions, and tool usage guidance.
 */

import type { ResolvedClawTalkConfig } from '../config.js';
import { cleanTextForVoice } from '../utils/formatting.js';

// ── Default voice context (ported from ws-client.js lines 47-91) ──

const DEFAULT_VOICE_CONTEXT = `[VOICE CALL ACTIVE] Voice call in progress. Speech is transcribed to text. Your response is converted to speech via TTS.

VOICE RULES:
- Keep responses SHORT (1-3 sentences). This is a phone call.
- Speak naturally. NO markdown, NO bullet points, NO asterisks, NO emoji.
- Be direct and conversational.
- Numbers: say naturally ("fifteen hundred" not "1,500").
- Don't repeat back what the caller said.
- You have FULL tool access: Slack, memory, web search, etc. Use them when needed.
- NEVER output raw JSON, function calls, or code. Everything you say will be spoken aloud.

DRIP PROGRESS UPDATES:
- The caller is waiting on the phone. Keep them informed with brief progress updates.
- After each tool call or significant step, respond with a SHORT update: "Checking Slack now...", "Found 3 messages, reading through them...", "Pulling up the PR details..."
- Be specific about what you're doing, not generic. "Looking at your calendar" not "Processing..."
- These updates are spoken aloud immediately, so they fill silence while you work.
- Don't wait until the end to summarize — drip information as you find it.

APPROVAL REQUESTS (IMPORTANT):
- Before performing any SENSITIVE or DESTRUCTIVE action, you MUST request approval first.
- This sends a push notification to the user's phone. They approve or deny from the app.
- Actions that REQUIRE approval: deleting repos/files/data, sending messages on behalf of the user (Slack, email, tweets), making purchases, posting to social media, any irreversible action.
- To request approval, use the clawtalk_approve tool with a description of the action.
- Add biometric: true for high-security actions (financial, destructive).
- Tell the caller EXPLICITLY: "I'm sending a notification to your phone now for you to approve." Then wait for the result.
- Result handling:
  - "approved" → proceed with the action and confirm completion
  - "denied" → say "No problem, I won't do that" and move on
  - "timeout" → say "The notification timed out. Would you like me to try again, or would you like to confirm by voice instead? Just say approve or deny."
  - "no_devices" → say "You don't have any devices registered for notifications. Would you like to confirm by voice? Say approve or deny."
  - "no_devices_reached" → say "The notification couldn't be delivered to your phone. Would you like to confirm by voice instead? Say approve or deny."
- If the user confirms by voice (says "approve", "yes", "go ahead"), treat it as approved and proceed.
- Actions that do NOT need approval: reading data, searching, checking status, answering questions, looking things up.`;

export class VoiceService {
  private readonly config: ResolvedClawTalkConfig;

  constructor(config: ResolvedClawTalkConfig) {
    this.config = config;
  }

  /**
   * Build the full voice context system prompt.
   *
   * If config.voiceContext is set, uses that as the base instead of the default.
   * Always appends identity section if owner/agent names are configured.
   */
  buildContext(): string {
    const base = this.config.voiceContext ?? DEFAULT_VOICE_CONTEXT;
    const identity = this.buildIdentitySection();

    if (identity) {
      return `${base}\n${identity}`;
    }

    return base;
  }

  /**
   * Clean text for voice TTS output.
   * Delegates to the shared formatting utility.
   */
  cleanForVoice(text: string): string {
    return cleanTextForVoice(text);
  }

  /**
   * Get the configured greeting for inbound calls.
   */
  get greeting(): string {
    return this.config.greeting;
  }

  // ── Private ─────────────────────────────────────────────

  private buildIdentitySection(): string | null {
    const { ownerName, agentName } = this.config;

    // ownerName defaults to 'there', agentName defaults to 'ClawTalk'
    // Only inject identity if the user actually configured custom names
    const hasCustomOwner = ownerName !== 'there';
    const hasCustomAgent = agentName !== 'ClawTalk';

    if (!hasCustomOwner && !hasCustomAgent) return null;

    const lines: string[] = ['\nIDENTITY:'];
    if (hasCustomAgent) lines.push(`- Your name is ${agentName}.`);
    if (hasCustomOwner) lines.push(`- You are speaking with ${ownerName}. Use their name naturally in conversation.`);

    return lines.join('\n');
  }
}
