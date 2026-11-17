import { ZodError } from "zod";
import { captureServerError } from "./sentry";
import { currentLogContext, log, withLogContext } from "./logger";
import { currentRequestId } from "./request-context";

export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(message);
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; reference?: string };

type ActionMeta = Record<string, unknown>;

/** A short id a user can quote in a support message. The full id stays in the log. */
function referenceFor(requestId: string | undefined) {
  return requestId?.slice(0, 8);
}

export async function runAction<T>(
  action: string,
  fn: () => Promise<T>,
  meta: ActionMeta = {},
): Promise<ActionResult<T>> {
  const requestId = currentRequestId();
  return withLogContext({ action, requestId, ...meta }, async () => {
    const started = performance.now();
    const durationMs = () => Math.round(performance.now() - started);

    try {
      const data = await fn();
      log.info("action.succeeded", { durationMs: durationMs() });
      return { ok: true, data };
    } catch (error) {
      if (error instanceof Response) throw error;

      if (error instanceof AppError) {
        log.warn("action.rejected", {
          reason: rejectionReason(error),
          status: error.status,
          error: error.message,
          durationMs: durationMs(),
        });
        return {
          ok: false,
          error: error.message,
          reference: referenceFor(requestId),
        };
      }

      if (error instanceof ZodError) {
        log.warn("action.rejected", {
          reason: "validation",
          fields: [...new Set(error.issues.map(issue => issue.path.join(".") || "(root)"))],
          issues: [...new Set(error.issues.map(issue => issue.code))],
          durationMs: durationMs(),
        });
        return {
          ok: false,
          error: error.issues[0]?.message ?? "Invalid input.",
          reference: referenceFor(requestId),
        };
      }

      if (isUniqueViolation(error)) {
        log.warn("action.rejected", {
          reason: "conflict",
          code: "23505",
          constraint: uniqueConstraint(error),
          durationMs: durationMs(),
        });
        return {
          ok: false,
          error: "That record already exists.",
          reference: referenceFor(requestId),
        };
      }

      log.error("action.failed", { error, durationMs: durationMs() });
      captureServerError(error, {
        source: "runAction",
        ...currentLogContext(),
        durationMs: durationMs(),
      });
      return {
        ok: false,
        error: "Something went wrong. Please try again.",
        reference: referenceFor(requestId),
      };
    }
  });
}

function rejectionReason(error: AppError) {
  if (error.status === 429) return "rate_limited";
  if (error.status === 401 || error.status === 403) return "forbidden";
  if (error.status === 404) return "not_found";
  return "rejected";
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function uniqueConstraint(error: unknown) {
  if (typeof error !== "object" || error === null || !("constraint" in error)) return undefined;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === "string" ? value : undefined;
}
