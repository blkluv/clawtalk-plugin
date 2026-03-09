/**
 * ClawTalk OpenClaw Plugin entry point.
 *
 * Exports an OpenClawPluginDefinition object. The register() function is called
 * by OpenClaw when the plugin loads. Config comes from api.pluginConfig.
 *
 * Phase 2: scaffold with config parsing.
 * Phase 6: full service/tool/route registration.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { type ClawTalkConfig, resolveConfig } from './config.js';

const clawTalkPlugin = {
  id: 'clawtalk',
  name: 'ClawTalk',
  description: 'Voice calls, SMS, missions, and approvals via ClawTalk',

  register(api: OpenClawPluginApi) {
    const rawConfig = (api.pluginConfig ?? {}) as unknown as ClawTalkConfig;
    const config = resolveConfig(rawConfig);

    api.logger.info(`ClawTalk plugin loaded (server: ${config.server})`);

    // Phase 4B: ClawTalkClient + WebSocketService instantiation happens here in Phase 6
    // Phase 3: Event handlers
    // Phase 4: Agent tools registration
    // Phase 5: Mission tools registration
    // Phase 6: Service lifecycle, HTTP routes, doctor checks
  },
};

export default clawTalkPlugin;
