/**
 * Plugin API types.
 *
 * Mirrors OpenClaw's PluginLogger interface so we don't depend on
 * internal type paths that aren't part of the public SDK exports.
 */

export interface Logger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
}
