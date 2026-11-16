import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./config";
import { isUuid } from "./ids";

const TOKEN_CONTEXT = "calendar-feed:v1";

function signature(feedId: string, secret: string) {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${feedId}`).digest("base64url");
}

/** The feed id is public; the signature proves it was issued by this server. */
export function calendarFeedToken(feedId: string, secret = env("SESSION_SECRET")) {
  return `${feedId}.${signature(feedId, secret)}`;
}

export function parseCalendarFeedToken(
  token: string,
  secret = env("SESSION_SECRET"),
): string | null {
  if (!token || token.length > 200) return null;
  const separator = token.indexOf(".");
  if (separator <= 0) return null;

  const feedId = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  if (!isUuid(feedId) || !provided) return null;

  const expected = signature(feedId, secret);
  if (provided.length !== expected.length) return null;

  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) return null;

  return timingSafeEqual(providedBytes, expectedBytes) ? feedId : null;
}
