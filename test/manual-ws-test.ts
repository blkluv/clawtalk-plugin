/**
 * Manual WebSocket connection test.
 * Run: npx tsx test/manual-ws-test.ts
 */

import { resolveConfig } from '../src/config.js';
import { ApiClient } from '../src/services/ApiClient.js';
import { WebSocketService } from '../src/services/WebSocketService.js';

const logger = {
  debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
  info: (msg: string) => console.log(`[INFO]  ${msg}`),
  warn: (msg: string) => console.log(`[WARN]  ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
};

const config = resolveConfig({
  apiKey: process.env.CLAWTALK_API_KEY ?? 'cc_live_7f02a17c1e1d1df3b48bc2fb64b1fa6ee818f332',
  server: process.env.CLAWTALK_SERVER ?? 'https://clawdtalk.com',
  ownerName: 'Ciaran',
  agentName: 'PAL-01',
});

async function main() {
  console.log('\n=== ClawTalk Manual Test ===\n');

  // 1. Test API client (conversations endpoint as auth check)
  console.log('--- Testing API Client ---');
  const api = new ApiClient(config, logger);
  try {
    const convos = await api.listConversations();
    console.log(`✅ API auth works. ${convos.conversations?.length ?? 0} conversations found.`);
  } catch (err) {
    console.log(`⚠️  API test: ${err}`);
  }

  // 2. Test WebSocket
  console.log('\n--- Testing WebSocket ---');
  const ws = new WebSocketService(config, logger);

  ws.on('connected', () => {
    console.log('✅ WebSocket authenticated and connected');
  });

  ws.on('disconnected', (code, reason) => {
    console.log(`WebSocket disconnected: code=${code} reason=${reason}`);
  });

  ws.on('error', (err) => {
    console.log(`WebSocket error: ${err.message}`);
  });

  // Log any events we receive
  ws.on('sms.received', (msg) => console.log(`📱 SMS from ${msg.from}: ${msg.body}`));
  ws.on('deep_tool_request', (msg) => console.log(`🔧 Deep tool: ${msg.query}`));
  ws.on('context_request', (msg) => console.log(`📞 Call context request: ${msg.call_id}`));
  ws.on('call.started', (msg) => console.log(`📞 Call started: ${msg.call_id} (${msg.direction})`));
  ws.on('call.ended', (msg) => console.log(`📞 Call ended: ${msg.call_id}`));
  ws.on('approval.responded', (msg) => console.log(`✅ Approval: ${msg.request_id} → ${msg.decision}`));
  ws.on('walkie_request', (msg) => console.log(`🎙️ Walkie: ${msg.transcript}`));

  try {
    await ws.connect();
    console.log(`✅ WebSocket connected (v${ws.version})`);
    console.log(`\nListening for events... (Ctrl+C to stop)\n`);

    // Keep alive for 30 seconds then disconnect
    setTimeout(() => {
      console.log('\n--- Disconnecting after 30s ---');
      ws.disconnect();
      console.log('✅ Clean disconnect');
      process.exit(0);
    }, 30000);
  } catch (err) {
    console.log(`❌ WebSocket connection failed: ${err}`);
    process.exit(1);
  }
}

main();
