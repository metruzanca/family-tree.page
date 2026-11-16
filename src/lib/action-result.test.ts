import { describe, expect, it, vi } from "vitest";
import { attemptAction, friendlyMessage, isRedirectResponse } from "./action-result";

describe("friendlyMessage", () => {
  it("passes through useful server messages", () => {
    expect(friendlyMessage(new Error("That person could not be found."))).toBe(
      "That person could not be found.",
    );
  });

  it("explains network failures", () => {
    expect(friendlyMessage(new Error("Failed to fetch"))).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });

  it("does not show raw server errors", () => {
    expect(friendlyMessage(new Error("Internal Server Error"))).toBe(
      "The server had a problem. Please try again in a moment.",
    );
  });

  it("maps response statuses", () => {
    expect(friendlyMessage(new Response(null, { status: 403 }))).toBe(
      "You do not have permission to do that.",
    );
    expect(friendlyMessage(new Response(null, { status: 503 }))).toBe(
      "The server had a problem. Please try again in a moment.",
    );
  });

  it("falls back for unknown failures", () => {
    expect(friendlyMessage("nope")).toBe("Something went wrong. Please try again.");
  });
});

describe("attemptAction", () => {
  it("returns the server action result unchanged", async () => {
    const result = await attemptAction(async () => ({ ok: true as const, data: "value" }));
    expect(result).toEqual({ ok: true, data: "value" });
  });

  it("turns a rejected call into an error result", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await attemptAction(async () => {
      throw new Error("Failed to fetch");
    });
    expect(result).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
    });
    consoleError.mockRestore();
  });

  it("re-throws redirects so the router can navigate", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "/trees" },
    });
    expect(isRedirectResponse(redirect)).toBe(true);
    await expect(
      attemptAction(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});
