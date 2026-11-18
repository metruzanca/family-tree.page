import { ApiError } from "./http";
import { decodeCursor } from "./cursor";

export function parseLimit(
  value: string | null | undefined,
  fallback = 50,
  maximum = 200,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "limit must be a positive integer.", "invalid_limit");
  }
  return Math.min(parsed, maximum);
}

export function parseSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "since must be an ISO timestamp.", "invalid_since");
  }
  return date;
}

/** Passes a cursor through after checking that it decodes. */
export function parseCursor(value: string | null | undefined) {
  if (!value) return null;
  if (!decodeCursor(value)) {
    throw new ApiError(
      400,
      "cursor is not a valid page cursor.",
      "invalid_cursor",
    );
  }
  return value;
}

export function searchParam(event: Request, name: string) {
  return new URL(event.url).searchParams.get(name);
}

export function clean(value: string | null | undefined, max = 120) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, max);
}

/** Case-insensitive contains, used by the family-scale in-memory search. */
export function includesText(value: string | null | undefined, needle: string) {
  if (!value) return false;
  return value.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}
