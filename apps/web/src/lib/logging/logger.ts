import { randomUUID } from 'node:crypto';

/**
 * Lightweight structured logger.
 *
 * Emits single-line JSON for machine ingestion (Vercel log drains, etc.).
 * - `msg` and `level` are always present; `correlationId` links a request.
 * - Values in `redactKeys` are never emitted; nested objects are redacted
 *   by key name, so accidental secret passing stays harmless.
 * - No external logging platform in M0; the same call sites will work when
 *   a drain/destination is attached later.
 */

const REDACT_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'secretkey',
  'apikey',
  'webhookhash',
  'servicekey',
]);

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const rawLevel = process.env.LOG_LEVEL;
const minLevel: LogLevel =
  rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error'
    ? rawLevel
    : 'info';

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(boundFields: Record<string, unknown>): Logger;
}

function createLogger(bound: Record<string, unknown> = {}): Logger {
  function log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(redact({ ...bound, ...fields }) as Record<string, unknown>),
    };

    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  return {
    debug: (msg, fields) => log('debug', msg, fields),
    info: (msg, fields) => log('info', msg, fields),
    warn: (msg, fields) => log('warn', msg, fields),
    error: (msg, fields) => log('error', msg, fields),
    child: (boundFields) => createLogger({ ...bound, ...boundFields }),
  };
}

export const logger = createLogger();

/** Correlation ID for a request; generate one when the client did not send a valid ID. */
export function getOrCreateCorrelationId(headerValue: string | undefined): string {
  if (headerValue && headerValue.length >= 8 && headerValue.length <= 128) {
    return headerValue;
  }
  return randomUUID();
}
