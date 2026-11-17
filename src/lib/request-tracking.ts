import { captureClientError } from "./sentry-client";

const QUEUE_KEY = "family-tree:failed-requests";
const MAX_QUEUE = 10;
const MAX_MESSAGE = 300;

type ClientFailure = {
  requestId: string;
  serverFnId?: string;
  status?: number;
  durationMs: number;
  online: boolean;
  errorName?: string;
  errorMessage?: string;
  path: string;
  at: string;
};

type AnnotatedError = Error & { requestId?: string };

function shorten(value: unknown, max = MAX_MESSAGE) {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function loadQueue(): ClientFailure[] {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientFailure[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: ClientFailure[]) {
  try {
    if (queue.length === 0) sessionStorage.removeItem(QUEUE_KEY);
    else sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // Private mode or storage quota. Dropping the queue is acceptable.
  }
}

function enqueue(failure: ClientFailure) {
  saveQueue([...loadQueue(), failure]);
  void captureClientError(new Error(failure.errorMessage ?? "Client request failed"), {
    source: "client.server-fn",
    requestId: failure.requestId,
    serverFnId: failure.serverFnId,
    status: failure.status,
    durationMs: failure.durationMs,
    online: failure.online,
  });
}

export async function flushClientFailures() {
  const queue = loadQueue();
  if (queue.length === 0) return;

  try {
    const response = await fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ failures: queue.slice(-MAX_QUEUE) }),
      keepalive: true,
    });
    if (response.ok) saveQueue([]);
  } catch {
    // Still offline. The queue is retried on the next online event or load.
  }
}

function isServerFunctionRequest(url: URL) {
  return url.origin === window.location.origin && url.pathname === "/_server";
}

export function annotateError(error: unknown, requestId: string) {
  if (error instanceof Error) {
    (error as AnnotatedError).requestId = requestId;
  }
  return error;
}

export function errorRequestId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("requestId" in error)) return undefined;
  const value = (error as AnnotatedError).requestId;
  return typeof value === "string" && value ? value : undefined;
}

function record(
  requestId: string,
  path: string,
  startedAt: number,
  details: { serverFnId?: string; status?: number; error?: unknown } = {},
) {
  const error = details.error;
  enqueue({
    requestId,
    serverFnId: details.serverFnId,
    status: details.status,
    durationMs: Math.round(performance.now() - startedAt),
    online: navigator.onLine !== false,
    errorName: error instanceof Error ? error.name : error ? "Error" : undefined,
    errorMessage:
      shorten(error instanceof Error ? error.message : error) ??
      (details.status ? `HTTP ${details.status}` : undefined),
    path,
    at: new Date().toISOString(),
  });
}

/**
 * Adds a request id to every server function call and reports transport
 * failures. Without this, a request that never reaches the server leaves no
 * trace anywhere.
 */
export function installRequestTracking() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url, window.location.href);
    if (!isServerFunctionRequest(url)) return originalFetch(input, init);

    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);
    const serverFnId = headers.get("x-server-id") ?? undefined;
    const startedAt = performance.now();

    try {
      const response = await originalFetch(new Request(request, { headers }));
      if (response.status >= 500) {
        record(requestId, url.pathname, startedAt, {
          serverFnId,
          status: response.status,
          error: `Server function returned HTTP ${response.status}`,
        });
      }
      return response;
    } catch (error) {
      record(requestId, url.pathname, startedAt, { serverFnId, error });
      throw annotateError(error, requestId);
    }
  };

  window.addEventListener("online", () => {
    void flushClientFailures();
  });
  void flushClientFailures();
}
