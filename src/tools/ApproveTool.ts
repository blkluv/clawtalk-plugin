/**
 * ApproveTool — clawtalk_approve: Request user approval via push notification.
 */

import { Type } from '@sinclair/typebox';
import type { ApprovalManager } from '../services/ApprovalManager.js';
import type { Logger } from '../types/plugin.js';
import type { ApproveToolParams, ApproveToolResult } from '../types/tools.js';
import { ToolError } from '../utils/errors.js';

// ── Schema ──────────────────────────────────────────────────

export const ApproveToolSchema = Type.Object({
  action: Type.String({ description: 'Description of what needs approval (e.g. "Send email to boss")' }),
  details: Type.Optional(Type.String({ description: 'Additional context shown in the approval notification' })),
  biometric: Type.Optional(
    Type.Boolean({ description: 'Require biometric (Face ID / fingerprint) confirmation. Default: false' }),
  ),
  timeout: Type.Optional(Type.Number({ description: 'Seconds to wait for approval before timing out. Default: 60' })),
});

// ── Helpers ─────────────────────────────────────────────────

function formatResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

const DECISION_MESSAGES: Record<string, string> = {
  approved: 'User approved the action.',
  denied: 'User denied the action.',
  timeout: 'Approval request timed out (no response from user).',
  no_devices: 'No devices registered for push notifications.',
  no_devices_reached: 'Could not reach any registered devices.',
};

// ── ApproveTool ─────────────────────────────────────────────

export class ApproveTool {
  private readonly approvalManager: ApprovalManager;
  private readonly logger: Logger;

  readonly name = 'clawtalk_approve';
  readonly label = 'ClawTalk Approve';
  readonly description =
    'Request user approval via push notification. Use before performing sensitive actions. Returns the decision: approved, denied, timeout, no_devices, or no_devices_reached.';
  readonly parameters = ApproveToolSchema;

  constructor(params: { approvalManager: ApprovalManager; logger: Logger }) {
    this.approvalManager = params.approvalManager;
    this.logger = params.logger;
  }

  async execute(_toolCallId: string, raw: Record<string, unknown>) {
    const params = raw as unknown as ApproveToolParams;
    this.logger.info(`Requesting approval: ${params.action}`);

    try {
      const decision = await this.approvalManager.requestApproval(params.action, {
        details: params.details,
        biometric: params.biometric,
        timeout: params.timeout,
      });

      const payload: ApproveToolResult = {
        decision,
        message: DECISION_MESSAGES[decision] ?? `Approval result: ${decision}`,
      };

      return formatResult(payload);
    } catch (err) {
      throw ToolError.fromError('clawtalk_approve', err);
    }
  }
}
