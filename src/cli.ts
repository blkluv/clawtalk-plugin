/**
 * ClawTalk CLI — registered via api.registerCli().
 *
 * Commands:
 *   openclaw clawtalk logs     — Tail the WS log file (live output)
 *
 * Pattern: openclaw/extensions/voice-call/src/cli.ts
 *
 * Note: We define a minimal CommandLike interface instead of importing
 * `Command` from `commander` because @swc/cli pulls in commander@8 while
 * OpenClaw uses commander@14, causing type conflicts. The interface covers
 * only the Commander API surface we actually use.
 */

import fs from 'node:fs';
import { sleep } from 'openclaw/plugin-sdk';

// ── Types ───────────────────────────────────────────────────

/** Subset of Commander's Command API used by this CLI. */
interface CommandLike {
  command(name: string): CommandLike;
  description(str: string): CommandLike;
  option(flags: string, description: string, defaultValue?: string): CommandLike;
  // biome-ignore lint/suspicious/noExplicitAny: Commander's action signature is inherently loose
  action(fn: (...args: any[]) => void | Promise<void>): CommandLike;
}

type Logger = {
  info: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

// ── CLI Registration ────────────────────────────────────────

export function registerClawTalkCli(params: { program: CommandLike; wsLogPath: string; logger: Logger }) {
  const { program, wsLogPath, logger } = params;

  const root = program.command('clawtalk').description('ClawTalk WebSocket utilities');

  root
    .command('logs')
    .description('Tail the ClawTalk WebSocket log (live output)')
    .option('--since <n>', 'Print last N lines first', '50')
    .option('--poll <ms>', 'Poll interval in ms', '250')
    .action(async (options: { since?: string; poll?: string }) => {
      const since = Math.max(0, Number(options.since ?? 50));
      const pollMs = Math.max(50, Number(options.poll ?? 250));

      if (!fs.existsSync(wsLogPath)) {
        logger.error?.(`No WS log file at ${wsLogPath}`);
        logger.info('The log file is created when the ClawTalk plugin connects. Start the gateway first.');
        process.exit(1);
      }

      // Print last N lines
      const initial = fs.readFileSync(wsLogPath, 'utf8');
      const lines = initial.split('\n').filter(Boolean);
      for (const line of lines.slice(Math.max(0, lines.length - since))) {
        // eslint-disable-next-line no-console
        console.log(line);
      }

      let offset = Buffer.byteLength(initial, 'utf8');

      // Tail loop
      for (;;) {
        try {
          const stat = fs.statSync(wsLogPath);
          // Handle rotation (file shrunk)
          if (stat.size < offset) {
            offset = 0;
          }
          if (stat.size > offset) {
            const fd = fs.openSync(wsLogPath, 'r');
            try {
              const buf = Buffer.alloc(stat.size - offset);
              fs.readSync(fd, buf, 0, buf.length, offset);
              offset = stat.size;
              const text = buf.toString('utf8');
              for (const line of text.split('\n').filter(Boolean)) {
                // eslint-disable-next-line no-console
                console.log(line);
              }
            } finally {
              fs.closeSync(fd);
            }
          }
        } catch {
          // File may have been rotated or doesn't exist yet, retry
        }
        await sleep(pollMs);
      }
    });
}
