import { ZodError } from "zod";
import { captureServerError } from "./sentry";

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
  | { ok: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof AppError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, error: "That record already exists." };
    }
    console.error(error);
    captureServerError(error, { source: "runAction" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
