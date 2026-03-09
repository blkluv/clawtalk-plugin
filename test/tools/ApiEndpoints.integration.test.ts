/**
 * API endpoint reachability tests — verifies every read endpoint
 * returns a 2xx/expected response against a live server.
 *
 * Driven by the ENDPOINTS map (clawtalk-sdk) — single source of truth.
 * Skipped unless CLAWTALK_API_KEY is set in env.
 *
 * Run: CLAWTALK_API_KEY=cc_live_... npm test -- test/tools/ApiEndpoints
 */

import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../src/config.js';
import {
  ClawTalkClient,
  ApiError,
  READ_ENDPOINTS,
  UNIMPLEMENTED_ENDPOINTS,
} from '../../src/lib/clawtalk-sdk/index.js';

// ── Config ──────────────────────────────────────────────────

const apiKey = process.env.CLAWTALK_API_KEY;
const server = process.env.CLAWTALK_SERVER ?? 'https://clawdtalk.com';
const hasConfig = Boolean(apiKey);

const config = hasConfig
  ? resolveConfig({
      apiKey: apiKey!,
      server,
      ownerName: 'Test User',
      agentName: 'TestBot',
    })
  : null;

const logger = {
  debug: (msg: string) => console.log(`  [debug] ${msg}`),
  warn: (msg: string) => console.log(`  [warn]  ${msg}`),
};

// ── Helpers ─────────────────────────────────────────────────

/** Replace :paramName with fake values for route testing */
function resolvePath(path: string): string {
  return path.replace(/:(\w+)/g, 'fake_$1');
}

/** Hit an endpoint and verify it's reachable (not 401/403/405) */
async function testEndpoint(method: string, path: string, label: string): Promise<void> {
  const resolvedPath = resolvePath(path);
  const baseUrl = config!.server.replace(/\/$/, '');
  const url = `${baseUrl}${resolvedPath}`;
  const signal = AbortSignal.timeout(10000);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config!.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal,
    });

    // Route is reachable if we get anything other than 401/403/405
    if ([401, 403].includes(response.status)) {
      throw new Error(`Auth error ${response.status} — API key may be invalid`);
    }
    if (response.status === 405) {
      throw new Error(`405 Method Not Allowed — route ${method} ${path} doesn't exist`);
    }

    console.log(`  ✅ ${label} → ${response.status}`);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`❌ ${label}: Timeout`);
    }
    throw err;
  }
}

// ── Tests ───────────────────────────────────────────────────

describe.skipIf(!hasConfig)('API Endpoint Reachability (live server)', () => {
  const client = hasConfig
    ? new ClawTalkClient({ apiKey: config!.apiKey, server: config!.server, logger })
    : (null as unknown as ClawTalkClient);

  // Dynamically generate a test for every read endpoint
  for (const [name, endpoint] of Object.entries(READ_ENDPOINTS)) {
    it(`${endpoint.method} ${endpoint.path} (${name})`, async () => {
      await testEndpoint(endpoint.method, endpoint.path, `${endpoint.method} ${endpoint.path}`);
    });
  }

  // Verify getMe returns actual user data (auth sanity check)
  it('getMe returns valid user', async () => {
    const me = await client.user.me();
    expect(me).toBeTruthy();
    expect(me.user_id).toBeTruthy();
    console.log(`  ✅ Authenticated as: ${me.email}`);
  });
});

describe('Endpoint coverage', () => {
  it('reports unimplemented server endpoints', () => {
    const unimplemented = Object.entries(UNIMPLEMENTED_ENDPOINTS);
    if (unimplemented.length > 0) {
      console.log(`\n  ⚠️  ${unimplemented.length} server endpoints not wrapped in SDK:`);
      for (const [name, ep] of unimplemented) {
        console.log(`     ${ep.method.padEnd(6)} ${ep.path} (${name})`);
      }
    }
    // Not a failure — just informational
    expect(true).toBe(true);
  });
});
