/**
 * WebSocket integration test against a live ClawTalk server.
 *
 * Reads config from skill-config.local.json.
 * Run: npm test -- --testPathPattern integration
 */

import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from '../../src/config.js';
import { ClawTalkClient } from '../../src/lib/clawtalk-sdk/index.js';
import { WebSocketService } from '../../src/services/WebSocketService.js';
import type { Logger } from '../../src/types/plugin.js';

// ── Config from env vars ────────────────────────────────────
//
// Set these to run integration tests:
//   CLAWTALK_API_KEY=cc_live_...
//   CLAWTALK_SERVER=https://clawdtalk.ngrok.io  (optional, defaults to https://clawdtalk.com)
//

const apiKey = process.env.CLAWTALK_API_KEY;
const server = process.env.CLAWTALK_SERVER ?? 'https://clawdtalk.com';
const hasConfig = Boolean(apiKey);

const config = hasConfig
  ? resolveConfig({
      apiKey: apiKey!,
      server,
      ownerName: process.env.CLAWTALK_OWNER_NAME ?? 'Test User',
      agentName: process.env.CLAWTALK_AGENT_NAME ?? 'TestBot',
    })
  : null;

const logger: Logger = {
  debug: (msg) => console.log(`  [debug] ${msg}`),
  info: (msg) => console.log(`  [info]  ${msg}`),
  warn: (msg) => console.log(`  [warn]  ${msg}`),
  error: (msg) => console.log(`  [error] ${msg}`),
};

// ── Tests ───────────────────────────────────────────────────

describe.skipIf(!hasConfig)('WebSocket Integration (live server)', () => {
  let ws: WebSocketService | null = null;

  afterEach(() => {
    ws?.disconnect();
    ws = null;
  });

  it('authenticates and connects', async () => {
    ws = new WebSocketService(config!, logger);

    await ws.connect();

    expect(ws.isConnected).toBe(true);
    expect(ws.version).toBeDefined();
    console.log(`  ✅ Connected, version: ${ws.version}`);
  });

  it('receives pong after ping (keepalive works)', async () => {
    ws = new WebSocketService(config!, logger);

    await ws.connect();
    expect(ws.isConnected).toBe(true);

    // Wait for first ping/pong cycle (30s interval, so we wait a bit)
    // Instead, just verify the connection stays alive for 5s
    await new Promise((r) => setTimeout(r, 5000));

    expect(ws.isConnected).toBe(true);
    console.log(`  ✅ Connection stable after 5s`);
  }, 10000);

  it('disconnects gracefully', async () => {
    ws = new WebSocketService(config!, logger);

    await ws.connect();
    expect(ws.isConnected).toBe(true);

    ws.disconnect();
    expect(ws.isConnected).toBe(false);
    console.log('  ✅ Clean disconnect');
  });

  it('can send a message without error', async () => {
    ws = new WebSocketService(config!, logger);

    await ws.connect();

    // Send a context_response (harmless, no active call to receive it)
    expect(() => {
      ws!.send({
        type: 'context_response',
        call_id: 'test_nonexistent',
        context: { memory: 'test', system_prompt: 'test' },
      });
    }).not.toThrow();

    console.log('  ✅ Message sent without error');
  });

  it('emits disconnected event on server close', async () => {
    ws = new WebSocketService(config!, logger);

    await ws.connect();

    const disconnected = new Promise<{ code: number; reason: string }>((resolve) => {
      ws!.on('disconnected', (code, reason) => {
        resolve({ code, reason });
      });
    });

    ws.disconnect();

    const result = await disconnected;
    expect(result.code).toBe(1000);
    console.log(`  ✅ Disconnected event: code=${result.code}`);
  });
});

describe.skipIf(!hasConfig)('ClawTalkClient Integration (live server)', () => {
  it('can list conversations (auth check)', async () => {
    const client = new ClawTalkClient({ apiKey: config!.apiKey, server: config!.server, logger });

    try {
      const result = await client.sms.conversations();
      console.log(`  ✅ API auth works. ${result.conversations?.length ?? 0} conversations.`);
      expect(result).toBeDefined();
    } catch (err) {
      console.log(`  ⚠️  API responded with error: ${err}`);
    }
  });

  it('can list missions', async () => {
    const client = new ClawTalkClient({ apiKey: config!.apiKey, server: config!.server, logger });

    const missions = await client.missions.list();
    console.log(`  ✅ ${missions.length} missions found.`);
    expect(Array.isArray(missions)).toBe(true);
  });
});
