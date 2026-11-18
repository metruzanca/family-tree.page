import type { ActionResult } from "~/server/errors";
import { errorRequestId } from "./request-tracking";
import { tClient } from "../i18n";
import type { TranslationKey } from "../i18n";

/** Redirects thrown by server functions must reach the router instead of becoming error text. */
export function isRedirectResponse(value: unknown): value is Response {
  if (!(value instanceof Response)) return false;
  return value.status >= 300 && value.status < 400 && value.headers.has("Location");
}

type Translate = (key: TranslationKey) => string;

/**
 * Turns an unknown failure, usually a rejected server function call or a
 * network error, into a sentence we can show a person.
 */
export function friendlyMessage(error: unknown, t: Translate = tClient): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return t("error.offline");
  }

  if (error instanceof Response) {
    if (error.status === 401) return t("error.sessionExpired");
    if (error.status === 403) return t("error.forbidden");
    if (error.status === 404) return t("error.notFound");
    if (error.status >= 500) return t("error.server");
    return t("error.request");
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (/failed to fetch|network ?error|fetch failed|load failed|networkerror/i.test(message)) {
      return t("error.network");
    }
    if (/internal server error|server function error|uncaught client exception/i.test(message)) {
      return t("error.server");
    }
    if (message) return message;
  }

  return t("error.generic");
}

export function withReference(
  message: string,
  reference: string | undefined,
  t: Translate = tClient,
) {
  if (!reference) return message;
  const suffix = t("error.reference").replace("{reference}", reference);
  if (message.includes(suffix)) return message;
  return `${message} ${suffix}`;
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
