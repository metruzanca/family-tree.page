import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[redacted]";
const SENSITIVE_KEY =
  /(email|password|secret|token|cookie|authorization|bio|firstname|lastname|displayname|nickname|maiden|birth|death|place|address|ip)/i;
const MAX_DEPTH = 4;
const MAX_STRING = 2_000;

export type LogContext = Record<string, unknown>;

const storage = new AsyncLocalStorage<LogContext>();

export function currentLogContext(): LogContext {
  return storage.getStore() ?? {};
}

export function withLogContext<T>(context: LogContext, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...storage.getStore(), ...context }, fn);
}

/** Enrich the active log context, for example after a session or tree lookup. */
export function setLogContext(patch: LogContext) {
  const store = storage.getStore();
  if (!store) return;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && value !== null) store[key] = value;
  }
}

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel) {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel()];
}

function truncate(value: string, max = MAX_STRING) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/** Error fields known to be safe. Postgres detail/where are intentionally ignored. */
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: truncate(String(error)) };
  }

  const extra = error as Error & {
    code?: unknown;
    status?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  const record: Record<string, unknown> = {
    name: error.name,
    message: truncate(error.message),
  };
  if (extra.code !== undefined) record.code = extra.code;
  if (extra.status !== undefined) record.status = extra.status;
  if (extra.constraint !== undefined) record.constraint = extra.constraint;
  if (extra.cause instanceof Error) {
    record.cause = { name: extra.cause.name, message: truncate(extra.cause.message) };
  } else if (typeof extra.cause === "string") {
    record.cause = truncate(extra.cause);
  }
  if (error.stack) record.stack = truncate(error.stack, 8_000);
  return record;
}

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitize(item, key, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = sanitize(childValue, childKey, depth + 1);
    }
    return result;
  }
  return String(value);
}

function prettyField(value: unknown) {
  if (typeof value === "string") return /\s/.test(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

function write(level: LogLevel, message: string, fields: LogContext = {}) {
  if (!shouldLog(level)) return;

  const context = currentLogContext();
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: "family-tree",
    env:
      process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || "dev",
  };

  for (const [key, value] of Object.entries({ ...context, ...fields })) {
    if (key === "error") continue;
    const clean = sanitize(value, key);
    if (clean !== undefined && clean !== null) record[key] = clean;
  }
  if (fields.error !== undefined) record.error = serializeError(fields.error);

  let line: string;
  if (process.env.NODE_ENV === "production") {
    line = `${JSON.stringify(record)}\n`;
  } else {
    const { ts, level: _level, msg, service: _service, env: _env, release: _release, ...rest } =
      record;
    const details = Object.entries(rest)
      .map(([key, value]) => `${key}=${prettyField(value)}`)
      .join(" ");
    line = `${ts} ${level.toUpperCase()} ${msg}${details ? ` ${details}` : ""}\n`;
    if (record.error && typeof record.error === "object") {
      const stack = (record.error as Record<string, unknown>).stack;
      if (typeof stack === "string" && stack !== record.error.message) line += `${stack}\n`;
    }
  }

  const target = level === "error" ? process.stderr : process.stdout;
  target.write(line);
}

export const log = {
  debug: (message: string, fields?: LogContext) => write("debug", message, fields),
  info: (message: string, fields?: LogContext) => write("info", message, fields),
  warn: (message: string, fields?: LogContext) => write("warn", message, fields),
  error: (message: string, fields?: LogContext) => write("error", message, fields),
};
