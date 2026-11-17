import type { ActionResult } from "~/server/errors";
import { errorRequestId } from "./request-tracking";

/** Redirects thrown by server functions must reach the router instead of becoming error text. */
export function isRedirectResponse(value: unknown): value is Response {
  if (!(value instanceof Response)) return false;
  return value.status >= 300 && value.status < 400 && value.headers.has("Location");
}

/**
 * Turns an unknown failure, usually a rejected server function call or a
 * network error, into a sentence we can show a person.
 */
export function friendlyMessage(error: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }

  if (error instanceof Response) {
    if (error.status === 401) return "Your session has expired. Sign in again.";
    if (error.status === 403) return "You do not have permission to do that.";
    if (error.status === 404) return "That item could not be found.";
    if (error.status >= 500) return "The server had a problem. Please try again in a moment.";
    return "That request could not be completed. Try again.";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (/failed to fetch|network ?error|fetch failed|load failed|networkerror/i.test(message)) {
      return "Could not reach the server. Check your connection and try again.";
    }
    if (/internal server error|server function error|uncaught client exception/i.test(message)) {
      return "The server had a problem. Please try again in a moment.";
    }
    if (message) return message;
  }

  return "Something went wrong. Please try again.";
}

export function withReference(message: string, reference: string | undefined) {
  if (!reference || message.includes(`Reference: ${reference}`)) return message;
  return `${message} Reference: ${reference}`;
}

export function failureReference(error: unknown, result?: { reference?: string }) {
  return result?.reference ?? (errorRequestId(error)?.slice(0, 8) || undefined);
}

/**
 * Client-side wrapper for server actions. Server actions already convert
 * expected failures into `{ ok: false }`, but a rejected call (network drop,
 * server restart, timeout) would otherwise escape an event handler and leave
 * the form stuck in its pending state.
 */
export async function attemptAction<T>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const result = await fn();
    if (result.ok) return result;
    return {
      ...result,
      error: withReference(result.error, failureReference(undefined, result)),
    };
  } catch (error) {
    if (isRedirectResponse(error)) throw error;
    console.error(error);
    const reference = failureReference(error);
    return {
      ok: false,
      error: withReference(friendlyMessage(error), reference),
      reference,
    };
  }
}
