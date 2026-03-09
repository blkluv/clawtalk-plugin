import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { WebSocketService } from '../../src/services/WebSocketService.js';
import { WebSocketError } from '../../src/utils/errors.js';
import type { ResolvedClawTalkConfig } from '../../src/config.js';
import type { Logger } from '../../src/types/plugin.js';

// ── Test helpers ────────────────────────────────────────────

let testPort = 19100;
function nextPort(): number {
  return testPort++;
}

function createConfig(port: number): ResolvedClawTalkConfig {
  return {
    enabled: true,
    apiKey: 'test_key',
    server: `http://localhost:${port}`,
    ownerName: 'Test',
    agentName: 'Bot',
    greeting: 'Hey!',
    agentId: 'main',
    autoConnect: true,
    voiceContext: undefined,
    missions: {
      enabled: true,
      defaultVoice: undefined,
      defaultModel: undefined,
    },
  };
}

const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ── Tests ───────────────────────────────────────────────────

describe('WebSocketService', () => {
  let wss: WebSocketServer;
  let service: WebSocketService;
  let port: number;

  beforeEach(() => {
    port = nextPort();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    service?.disconnect();
    await new Promise<void>((resolve) => {
      if (wss) {
        wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  function startServer(onConnection?: (ws: import('ws').WebSocket) => void): Promise<void> {
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port, path: '/ws' }, () => resolve());
      if (onConnection) {
        wss.on('connection', onConnection);
      }
    });
  }

  describe('authentication', () => {
    it('sends auth message on connect and handles auth_ok', async () => {
      let receivedAuth: Record<string, unknown> | null = null;

      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            receivedAuth = msg;
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);
      await service.connect();

      expect(service.isConnected).toBe(true);
      expect(receivedAuth).not.toBeNull();
      expect(receivedAuth?.api_key).toBe('test_key');
      expect(receivedAuth?.client_version).toBeDefined();
      expect(receivedAuth?.agent_name).toBe('Bot');
    });

    it('rejects on auth_error', async () => {
      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid key' }));
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);

      await expect(service.connect()).rejects.toThrow(WebSocketError);
      expect(service.isConnected).toBe(false);
    });
  });

  describe('event dispatch', () => {
    it('dispatches typed events to handlers', async () => {
      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_ok' }));

            // Send a test event after auth
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: 'event',
                  event: 'sms.received',
                  from: '+1234567890',
                  body: 'Hello from test',
                  message_id: 'msg_test_1',
                }),
              );
            }, 50);
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);

      const received = new Promise<{ from: string; body: string }>((resolve) => {
        service.on('sms.received', (msg) => {
          resolve({ from: msg.from, body: msg.body });
        });
      });

      await service.connect();

      const result = await received;
      expect(result.from).toBe('+1234567890');
      expect(result.body).toBe('Hello from test');
    });

    it('dispatches deep_tool_request events', async () => {
      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  type: 'event',
                  event: 'deep_tool_request',
                  call_id: 'call_1',
                  request_id: 'req_1',
                  query: 'What time is it?',
                  context: {},
                }),
              );
            }, 50);
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);

      const received = new Promise<{ callId: string; query: string }>((resolve) => {
        service.on('deep_tool_request', (msg) => {
          resolve({ callId: msg.call_id, query: msg.query });
        });
      });

      await service.connect();

      const result = await received;
      expect(result.callId).toBe('call_1');
      expect(result.query).toBe('What time is it?');
    });
  });

  describe('send', () => {
    it('sends messages when connected', async () => {
      const serverReceived: unknown[] = [];

      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          } else {
            serverReceived.push(msg);
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);
      await service.connect();

      service.send({
        type: 'context_response',
        call_id: 'call_1',
        context: { memory: 'test', system_prompt: 'test prompt' },
      });

      // Give the message time to arrive
      await new Promise((r) => setTimeout(r, 100));

      expect(serverReceived).toHaveLength(1);
      expect((serverReceived[0] as Record<string, unknown>).type).toBe('context_response');
    });

    it('throws WebSocketError when not connected', () => {
      service = new WebSocketService(createConfig(port), mockLogger);

      expect(() => {
        service.send({ type: 'context_response', call_id: 'x', context: { memory: '', system_prompt: '' } });
      }).toThrow(WebSocketError);
    });
  });

  describe('reconnect', () => {
    it('does not reconnect on duplicate client close (4000)', async () => {
      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_ok' }));
            // Immediately close with duplicate code
            setTimeout(() => ws.close(4000, 'duplicate'), 50);
          }
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);
      await service.connect();

      // Wait for the close to be processed
      await new Promise((r) => setTimeout(r, 200));

      expect(service.isConnected).toBe(false);
      // Should have logged the duplicate error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Another client'),
      );
    });
  });

  describe('restart notification', () => {
    it('sends client_restart on reconnect but not first connect', async () => {
      const serverMessages: Array<Record<string, unknown>> = [];

      await startServer((ws) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          if (msg.type === 'auth') {
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          }
          serverMessages.push(msg);
        });
      });

      service = new WebSocketService(createConfig(port), mockLogger);
      await service.connect();

      // First connect: no restart message
      const restartMsgsAfterFirst = serverMessages.filter((m) => m.type === 'client_restart');
      expect(restartMsgsAfterFirst).toHaveLength(0);

      // Disconnect and reconnect
      service.disconnect();
      serverMessages.length = 0;

      await service.connect();

      // Give it a moment for the restart message
      await new Promise((r) => setTimeout(r, 100));

      const restartMsgsAfterReconnect = serverMessages.filter((m) => m.type === 'client_restart');
      expect(restartMsgsAfterReconnect).toHaveLength(1);
      expect(restartMsgsAfterReconnect[0]?.reason).toBe('reconnect');
    });
  });
});
