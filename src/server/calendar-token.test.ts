import { describe, expect, it } from "vitest";
import { calendarFeedToken, parseCalendarFeedToken } from "./calendar-token";

const FEED_ID = "0b5f9c62-6f0f-4a63-9f4d-3f4a1e2b7c8d";
const SECRET = "test-secret-with-at-least-32-characters";

describe("calendar feed tokens", () => {
  it("round-trips a signed feed id", () => {
    const token = calendarFeedToken(FEED_ID, SECRET);
    expect(token.startsWith(`${FEED_ID}.`)).toBe(true);
    expect(parseCalendarFeedToken(token, SECRET)).toBe(FEED_ID);
  });

  it("rejects tampered signatures", () => {
    const token = calendarFeedToken(FEED_ID, SECRET);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(parseCalendarFeedToken(tampered, SECRET)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(parseCalendarFeedToken("", SECRET)).toBeNull();
    expect(parseCalendarFeedToken("not-a-token", SECRET)).toBeNull();
    expect(parseCalendarFeedToken(`${FEED_ID}.`, SECRET)).toBeNull();
    expect(parseCalendarFeedToken(`not-a-uuid.signature`, SECRET)).toBeNull();
    expect(parseCalendarFeedToken("a".repeat(201), SECRET)).toBeNull();
  });

  it("rejects a signature made with another secret", () => {
    const token = calendarFeedToken(FEED_ID, "a-different-secret-with-32-characters");
    expect(parseCalendarFeedToken(token, SECRET)).toBeNull();
  });
});
