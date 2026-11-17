import { getRequestEvent } from "solid-js/web";

type NativeRequestEvent = {
  nativeEvent?: { context?: Record<string, unknown> };
  request?: Request;
};

/**
 * Reads the request id attached by the Nitro request hook. Returns undefined in
 * background jobs, scripts and tests where there is no active request.
 */
export function currentRequestId(): string | undefined {
  try {
    const event = getRequestEvent() as NativeRequestEvent | undefined;
    const fromContext = event?.nativeEvent?.context?.requestId;
    if (typeof fromContext === "string" && fromContext) return fromContext;
    const fromHeader = event?.request?.headers.get("x-request-id");
    return fromHeader && /^[a-zA-Z0-9-]{8,64}$/.test(fromHeader) ? fromHeader : undefined;
  } catch {
    return undefined;
  }
}

export function currentRequestPath(): string | undefined {
  try {
    const event = getRequestEvent() as NativeRequestEvent | undefined;
    if (!event?.request) return undefined;
    const url = new URL(event.request.url);
    return url.pathname;
  } catch {
    return undefined;
  }
}
