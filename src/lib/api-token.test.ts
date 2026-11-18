import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken } from "./api-token";

describe("API tokens", () => {
  it("generates an opaque token with a short display prefix", () => {
    const generated = generateApiToken();
    expect(generated.token.startsWith("rt_")).toBe(true);
    expect(generated.token.length).toBeGreaterThan(30);
    expect(generated.prefix).toHaveLength(12);
    expect(generated.prefix).toBe(generated.token.slice(0, 12));
    expect(generated.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.hash).toBe(hashApiToken(generated.token));
  });

  it("hashes deterministically and separates different tokens", () => {
    const first = generateApiToken();
    const second = generateApiToken();
    expect(first.token).not.toBe(second.token);
    expect(hashApiToken(first.token)).toBe(hashApiToken(first.token));
    expect(hashApiToken(first.token)).not.toBe(hashApiToken(second.token));
  });

  it("does not store the raw token in the hash", () => {
    const generated = generateApiToken();
    expect(generated.hash).not.toContain(generated.token);
  });
});
