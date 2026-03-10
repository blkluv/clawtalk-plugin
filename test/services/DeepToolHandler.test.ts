import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepToolHandler } from '../../src/services/DeepToolHandler.js';
import type { ICoreBridge } from '../../src/services/CoreBridge.js';
import type { VoiceService } from '../../src/services/VoiceService.js';
import type { WebSocketService } from '../../src/services/WebSocketService.js';
import type { Logger } from '../../src/types/plugin.js';
import type { WsDeepToolRequest } from '../../src/types/websocket.js';

// ── Mocks ───────────────────────────────────────────────────

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockWs(): WebSocketService {
  return { send: vi.fn() } as unknown as WebSocketService;
}

function createMockVoiceService(): VoiceService {
  return {
    buildContext: vi.fn().mockReturnValue('VOICE CONTEXT'),
    cleanForVoice: vi.fn((text: string) => text.replace(/[*_]/g, '')),
    greeting: 'Hey, what\'s up?',
  } as unknown as VoiceService;
}

function createMockCoreBridge(reply: string | null = 'Test reply'): ICoreBridge {
  return {
    runAgentTurn: vi.fn().mockResolvedValue(reply),
    enqueueSystemEvent: vi.fn(),
  };
}

function createDeepToolMsg(overrides?: Partial<WsDeepToolRequest>): WsDeepToolRequest {
  return {
    type: 'event',
    event: 'deep_tool_request',
    call_id: 'call_123',
    request_id: 'dt_456',
    query: 'What is the weather?',
    call_control_id: 'v3:abc',
    urgency: 'normal',
    context: 'User asking about weather',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('DeepToolHandler', () => {
  let handler: DeepToolHandler;
  let ws: WebSocketService;
  let coreBridge: ICoreBridge;
  let voiceService: VoiceService;
  let logger: Logger;

  beforeEach(() => {
    ws = createMockWs();
    coreBridge = createMockCoreBridge();
    voiceService = createMockVoiceService();
    logger = createMockLogger();
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });
  });

  it('routes query to CoreBridge and sends cleaned result', async () => {
    await handler.handle(createDeepToolMsg());

    expect(coreBridge.runAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: 'clawtalk:call:call_123',
        timeoutMs: 120_000,
      }),
    );

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deep_tool_result',
        request_id: 'dt_456',
        call_id: 'call_123',
        text: 'Test reply',
      }),
    );
  });

  it('uses voice context as extraSystemPrompt', async () => {
    await handler.handle(createDeepToolMsg());

    expect(coreBridge.runAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        extraSystemPrompt: 'VOICE CONTEXT',
      }),
    );
  });

  it('returns "Done." when agent replies HEARTBEAT_OK', async () => {
    coreBridge = createMockCoreBridge('HEARTBEAT_OK');
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Done.' }),
    );
  });

  it('returns "Done." when agent returns null', async () => {
    coreBridge = createMockCoreBridge(null);
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Done.' }),
    );
  });

  it('returns timeout error message when agent times out', async () => {
    const timeoutError = new Error('Request timed out after 120000ms');
    timeoutError.name = 'TimeoutError';
    coreBridge = { runAgentTurn: vi.fn().mockRejectedValue(timeoutError), enqueueSystemEvent: vi.fn() };
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'That took too long. Try asking again.' }),
    );
  });

  it('returns CoreBridge unavailable error', async () => {
    const bridgeError = new Error('CORE_BRIDGE_UNAVAILABLE: missing extensionAPI.js');
    coreBridge = { runAgentTurn: vi.fn().mockRejectedValue(bridgeError), enqueueSystemEvent: vi.fn() };
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Agent system is unavailable right now.' }),
    );
  });

  it('returns generic execution error for unknown failures', async () => {
    coreBridge = { runAgentTurn: vi.fn().mockRejectedValue(new Error('something broke')), enqueueSystemEvent: vi.fn() };
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Agent execution failed.' }),
    );
  });

  it('cleans voice output through voiceService', async () => {
    coreBridge = createMockCoreBridge('**bold** and _italic_');
    handler = new DeepToolHandler({ ws, coreBridge, voiceService, logger });

    await handler.handle(createDeepToolMsg());

    expect(voiceService.cleanForVoice).toHaveBeenCalledWith('**bold** and _italic_');
    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'bold and italic' }),
    );
  });
});
