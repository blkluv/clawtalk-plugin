/**
 * ClawTalk plugin configuration.
 *
 * The JSON Schema equivalent lives in openclaw.plugin.json (configSchema).
 * Keep both in sync when adding fields.
 */

export interface MissionsConfig {
  /** Enable mission tools. Default: true */
  readonly enabled?: boolean;
  /** Default TTS voice for mission assistants */
  readonly defaultVoice?: string;
  /** Default AI model for mission assistants */
  readonly defaultModel?: string;
  /** Mission observer (background lifecycle nudges) */
  readonly observer?: {
    /** Enable MissionObserver background checks. Default: true */
    readonly enabled?: boolean;
    /** Observer interval in milliseconds. Default: 300000 (5m) */
    readonly intervalMs?: number;
    /** Stale mission threshold in milliseconds. Default: 7200000 (2h) */
    readonly staleThresholdMs?: number;
    /** Cooldowns to prevent repeated nudges */
    readonly cooldowns?: {
      /** Pending call follow-up cooldown (ms). Default: 900000 (15m) */
      readonly pendingCallsMs?: number;
      /** Stale mission cooldown (ms). Default: 3600000 (1h) */
      readonly staleMs?: number;
      /** Terminal-plan-but-running cooldown (ms). Default: 3600000 (1h) */
      readonly terminalPlanMs?: number;
    };
  };
}

export interface ClawTalkConfig {
  /** Whether the plugin is enabled */
  readonly enabled?: boolean;
  /** ClawTalk API key (required) */
  readonly apiKey: string;
  /** Server URL. Default: "https://clawdtalk.com" */
  readonly server?: string;
  /** User's name for voice greeting */
  readonly ownerName?: string;
  /** Agent's name for voice context */
  readonly agentName?: string;
  /** Custom greeting for inbound calls. Supports {ownerName} placeholder. */
  readonly greeting?: string;
  /** Gateway agent ID. Default: "main" */
  readonly agentId?: string;
  /** Connect WebSocket on startup. Default: true */
  readonly autoConnect?: boolean;
  /** Override default voice context prompt */
  readonly voiceContext?: string;
  /** Mission-specific configuration */
  readonly missions?: MissionsConfig;
}

/** Resolved config with defaults applied */
export interface ResolvedClawTalkConfig {
  readonly enabled: boolean;
  readonly apiKey: string;
  readonly server: string;
  readonly ownerName: string;
  readonly agentName: string;
  readonly greeting: string;
  readonly agentId: string;
  readonly autoConnect: boolean;
  readonly voiceContext: string | undefined;
  readonly missions: {
    readonly enabled: boolean;
    readonly defaultVoice: string | undefined;
    readonly defaultModel: string | undefined;
    readonly observer: {
      readonly enabled: boolean;
      readonly intervalMs: number;
      readonly staleThresholdMs: number;
      readonly cooldowns: {
        readonly pendingCallsMs: number;
        readonly staleMs: number;
        readonly terminalPlanMs: number;
      };
    };
  };
}

const DEFAULT_SERVER = 'https://clawdtalk.com';
const DEFAULT_AGENT_ID = 'main';
const DEFAULT_AGENT_NAME = 'ClawTalk';
const DEFAULT_MISSION_OBSERVER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MISSION_STALE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MISSION_PENDING_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_MISSION_STALE_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_MISSION_TERMINAL_COOLDOWN_MS = 60 * 60 * 1000;

const DEFAULT_VOICE_CONTEXT = [
  'You are a voice assistant. Keep responses concise and conversational.',
  'Do not use markdown, bullet points, or formatting — this will be spoken aloud.',
  'Avoid lists. Use short, natural sentences.',
  'If you need to convey multiple points, use conversational transitions.',
].join(' ');

export function resolveConfig(raw: ClawTalkConfig): ResolvedClawTalkConfig {
  const ownerName = raw.ownerName ?? 'there';
  const agentName = raw.agentName ?? DEFAULT_AGENT_NAME;
  const defaultGreeting = `Hey ${ownerName}, what's up?`;
  const missionsEnabled = raw.missions?.enabled ?? true;

  return {
    enabled: raw.enabled ?? true,
    apiKey: raw.apiKey,
    server: raw.server ?? DEFAULT_SERVER,
    ownerName,
    agentName,
    greeting: raw.greeting?.replace('{ownerName}', ownerName) ?? defaultGreeting,
    agentId: raw.agentId ?? DEFAULT_AGENT_ID,
    autoConnect: raw.autoConnect ?? true,
    voiceContext: raw.voiceContext ?? DEFAULT_VOICE_CONTEXT,
    missions: {
      enabled: missionsEnabled,
      defaultVoice: raw.missions?.defaultVoice,
      defaultModel: raw.missions?.defaultModel,
      observer: {
        enabled: missionsEnabled && (raw.missions?.observer?.enabled ?? true),
        intervalMs: raw.missions?.observer?.intervalMs ?? DEFAULT_MISSION_OBSERVER_INTERVAL_MS,
        staleThresholdMs: raw.missions?.observer?.staleThresholdMs ?? DEFAULT_MISSION_STALE_MS,
        cooldowns: {
          pendingCallsMs: raw.missions?.observer?.cooldowns?.pendingCallsMs ?? DEFAULT_MISSION_PENDING_COOLDOWN_MS,
          staleMs: raw.missions?.observer?.cooldowns?.staleMs ?? DEFAULT_MISSION_STALE_COOLDOWN_MS,
          terminalPlanMs: raw.missions?.observer?.cooldowns?.terminalPlanMs ?? DEFAULT_MISSION_TERMINAL_COOLDOWN_MS,
        },
      },
    },
  };
}
