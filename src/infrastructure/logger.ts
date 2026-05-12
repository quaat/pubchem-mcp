import pino from 'pino';
import type { Config } from './config.js';

export type Logger = pino.Logger;

export function createLogger(config: Pick<Config, 'logLevel'>): Logger {
  // Stdout is reserved for the MCP stdio framing; always write logs to stderr.
  return pino(
    {
      level: config.logLevel,
      base: { name: 'pubchem-mcp' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination(2),
  );
}
