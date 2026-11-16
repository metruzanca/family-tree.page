import { describe, expect, it } from "vitest";
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  generateToken,
  hashToken,
  isPlausibleToken,
} from "./tokens";

describe("auth tokens", () => {
  it("generates url-safe tokens with enough entropy", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(generateToken()).not.toBe(token);
  });

  it("hashes deterministically without keeping the plain token", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("other")).not.toBe(hashToken(token));
  });

  it("rejects empty or oversized tokens", () => {
    expect(isPlausibleToken("")).toBe(false);
    expect(isPlausibleToken("a".repeat(201))).toBe(false);
    expect(isPlausibleToken(null)).toBe(false);
    expect(isPlausibleToken(generateToken())).toBe(true);
  });

  it("keeps reset links shorter-lived than verification links", () => {
    expect(PASSWORD_RESET_TTL_MS).toBeLessThan(EMAIL_VERIFICATION_TTL_MS);
  });
});
