import { randomUUID } from "node:crypto";
import { definePlugin } from "nitro";
import { log } from "../../src/server/logger";

const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;
const LOGGED_PATHS = ["/_server", "/api/"];

type RequestContext = {
  requestId?: string;
  requestStartedAt?: number;
  requestMethod?: string;
  requestPath?: string;
  userId?: string;
  treeId?: string;
  role?: string;
  action?: string;
  requestAbortedLogged?: boolean;
};

type RuntimeEvent = {
  req: { url: string; method?: string; headers?: Headers };
  context: Record<string, unknown>;
  runtime?: { node?: { res?: NodeResponse } };
};

type NodeResponse = {
  writableFinished?: boolean;
  once?: (event: string, listener: () => void) => void;
};

function contextOf(event: RuntimeEvent) {
  return (event.context ?? {}) as RequestContext;
}

function pathOf(url: string) {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return url;
  }
}

function requestIdOf(event: RuntimeEvent) {
  const existing = contextOf(event).requestId;
  if (existing) return existing;
  const header = event.req?.headers?.get("x-request-id")?.trim();
  if (header && REQUEST_ID.test(header)) return header;
  return randomUUID();
}

function shouldLogAtInfo(method: string, path: string) {
  if (path === "/api/health") return false;
  return method !== "GET" && method !== "HEAD" || LOGGED_PATHS.some(prefix => path.startsWith(prefix));
}

export default definePlugin(nitroApp => {
  log.info("app.started", {
    node: process.version,
    sentry: Boolean(process.env.SENTRY_DSN?.trim()),
    logLevel: process.env.LOG_LEVEL?.trim() || undefined,
  });

  nitroApp.hooks.hook("request", rawEvent => {
    const event = rawEvent as unknown as RuntimeEvent;
    const path = pathOf(event.req.url);
    const method = event.req.method ?? "GET";
    const requestId = requestIdOf(event);
    const context = contextOf(event);
    context.requestId = requestId;
    context.requestStartedAt = performance.now();
    context.requestMethod = method;
    context.requestPath = path;

    if (shouldLogAtInfo(method, path)) {
      log.debug("request.started", { requestId, method, path });
    }

    const res = event.runtime?.node?.res;
    res?.once?.("close", () => {
      if (res.writableFinished || context.requestAbortedLogged) return;
      context.requestAbortedLogged = true;
      log.warn("request.aborted", {
        requestId,
        method,
        path,
        durationMs: Math.round(performance.now() - (context.requestStartedAt ?? performance.now())),
        userId: context.userId,
        treeId: context.treeId,
        action: context.action,
      });
    });
  });

  nitroApp.hooks.hook("response", (res, rawEvent) => {
    const event = rawEvent as unknown as RuntimeEvent;
    const context = contextOf(event);
    const requestId = context.requestId ?? requestIdOf(event);
    try {
      res.headers.set("x-request-id", requestId);
    } catch {
      // Headers are immutable once a streaming response has started.
    }

    const method = context.requestMethod ?? event.req.method ?? "GET";
    const path = context.requestPath ?? pathOf(event.req.url);
    const fields = {
      requestId,
      method,
      path,
      status: res.status,
      durationMs: Math.round(
        performance.now() - (context.requestStartedAt ?? performance.now()),
      ),
      userId: context.userId,
      treeId: context.treeId,
      role: context.role,
      action: context.action,
    };
    if (shouldLogAtInfo(method, path)) {
      log.info("request.completed", fields);
    } else {
      log.debug("request.completed", fields);
    }
  });
});
