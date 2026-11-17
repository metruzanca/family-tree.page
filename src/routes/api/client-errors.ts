import type { APIEvent } from "@solidjs/start/server";
import { getRequestIP } from "@solidjs/start/http";
import { log } from "../../server/logger";
import { checkRateLimit } from "../../server/auth-service";

const MAX_BODY_BYTES = 8_192;
const MAX_FAILURES = 10;
const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

type Failure = {
  requestId?: unknown;
  serverFnId?: unknown;
  status?: unknown;
  durationMs?: unknown;
  online?: unknown;
  errorName?: unknown;
  errorMessage?: unknown;
  path?: unknown;
  at?: unknown;
};

function text(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}

export async function POST({ request }: APIEvent) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let ip = "unknown";
  try {
    ip = getRequestIP() ?? "unknown";
  } catch {
    // No request IP available in this runtime.
  }
  if (!checkRateLimit("client-errors", ip, 60, 60_000)) {
    return new Response(null, { status: 429 });
  }

  let payload: { failures?: unknown };
  try {
    payload = (await request.json()) as { failures?: unknown };
  } catch {
    return new Response(null, { status: 400 });
  }

  const failures = Array.isArray(payload.failures)
    ? payload.failures.slice(0, MAX_FAILURES)
    : [];
  for (const raw of failures) {
    if (typeof raw !== "object" || raw === null) continue;
    const failure = raw as Failure;
    const requestId =
      typeof failure.requestId === "string" && REQUEST_ID.test(failure.requestId)
        ? failure.requestId
        : undefined;
    if (!requestId) continue;
    log.warn("client.failure", {
      clientRequestId: requestId,
      serverFnId: text(failure.serverFnId, 120),
      status: number(failure.status),
      durationMs: number(failure.durationMs),
      online: typeof failure.online === "boolean" ? failure.online : undefined,
      errorName: text(failure.errorName, 80),
      errorMessage: text(failure.errorMessage, 300),
      path: text(failure.path, 200),
      at: text(failure.at, 40),
    });
  }

  return new Response(null, { status: 204 });
}
