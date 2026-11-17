import { describe, expect, it, vi } from "vitest";
import { attemptAction, failureReference, friendlyMessage, isRedirectResponse, withReference } from "./action-result";
import { annotateError, errorRequestId } from "./request-tracking";

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

describe("action failure references", () => {
  it("adds a reference once", () => {
    expect(withReference("Could not save. Reference: abc12345", "abc12345")).toBe(
      "Could not save. Reference: abc12345",
    );
    expect(withReference("Could not save.", "abc12345")).toBe(
      "Could not save. Reference: abc12345",
    );
    expect(withReference("Could not save.", undefined)).toBe("Could not save.");
  });

  it("reads a request id from a network error", () => {
    const error = annotateError(new Error("Failed to fetch"), "12345678-abcd");
    expect(errorRequestId(error)).toBe("12345678-abcd");
    expect(failureReference(error)).toBe("12345678");
  });

  it("prefers the reference returned by the server", () => {
    expect(failureReference(new Error("ignored"), { reference: "deadbeef" })).toBe("deadbeef");
  });

  it("appends the server reference to the message", async () => {
    const result = await attemptAction(async () => ({
      ok: false as const,
      error: "That person could not be found.",
      reference: "deadbeef",
    }));
    expect(result).toEqual({
      ok: false,
      error: "That person could not be found. Reference: deadbeef",
      reference: "deadbeef",
    });
  });
});
