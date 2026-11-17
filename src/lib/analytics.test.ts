import { describe, expect, it, vi } from "vitest";
import { sanitizePagePath, sizeBucket, track, trackPageview } from "./analytics";

describe("sanitizePagePath", () => {
  it("keeps public pages", () => {
    expect(sanitizePagePath("/")).toBe("/");
    expect(sanitizePagePath("/login")).toBe("/login");
    expect(sanitizePagePath("/register")).toBe("/register");
    expect(sanitizePagePath("/privacy")).toBe("/privacy");
    expect(sanitizePagePath("/terms")).toBe("/terms");
  });

  it("strips tokens and ids from private paths", () => {
    expect(sanitizePagePath("/invite/abc123")).toBe("/invite");
    expect(sanitizePagePath("/reset-password/abc123")).toBe("/reset-password");
    expect(sanitizePagePath("/verify-email/abc123")).toBe("/verify-email");
    expect(sanitizePagePath("/change-email/abc123")).toBe("/change-email");
    expect(sanitizePagePath("/share/abc123")).toBe("/share");
    expect(sanitizePagePath("/trees/8b0c6c2e-3f5a-4b4e-9f0c-2f6a1d9e7c11")).toBe("/app");
    expect(sanitizePagePath("/trees/8b0c6c2e/settings")).toBe("/app");
    expect(sanitizePagePath("/settings")).toBe("/app");
  });

  it("drops unknown paths instead of guessing", () => {
    expect(sanitizePagePath("/api/account/export")).toBeNull();
    expect(sanitizePagePath("/a-random-token")).toBeNull();
    expect(sanitizePagePath("not-a-path")).toBeNull();
  });

  it("ignores query strings and hashes and trailing slashes", () => {
    expect(sanitizePagePath("/login?redirectTo=/trees/123")).toBe("/login");
    expect(sanitizePagePath("/invite/abc#top")).toBe("/invite");
    expect(sanitizePagePath("/trees/")).toBe("/app");
  });
});

describe("sizeBucket", () => {
  it("returns coarse buckets only", () => {
    expect(sizeBucket(0)).toBe("under_1mb");
    expect(sizeBucket(500_000)).toBe("under_1mb");
    expect(sizeBucket(2_000_000)).toBe("1_to_10mb");
    expect(sizeBucket(20_000_000)).toBe("10_to_50mb");
    expect(sizeBucket(80_000_000)).toBe("over_50mb");
  });
});

describe("track", () => {
  it("does nothing without a browser", () => {
    expect(() => track("tree_created")).not.toThrow();
  });

  it("drops payload keys that are not on the allowlist", () => {
    const calls: unknown[][] = [];
    vi.stubGlobal("window", {
      umami: {
        track: (...args: unknown[]) => calls.push(args),
      },
      location: { origin: "https://family-tree.page" },
    });

    track("media_uploaded", {
      count: 2,
      album: true,
      size_bucket: "1_to_10mb",
      // A future caller must not be able to leak a file name.
      fileName: "grandma-passport.pdf",
    } as never);

    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      count: 2,
      album: true,
      size_bucket: "1_to_10mb",
    });
    vi.unstubAllGlobals();
  });
});

describe("trackPageview", () => {
  it("sends only the sanitized path", () => {
    const calls: unknown[][] = [];
    vi.stubGlobal("window", {
      umami: {
        track: (...args: unknown[]) => calls.push(args),
      },
      location: { origin: "https://family-tree.page" },
    });

    trackPageview("/invite/super-secret-token");
    trackPageview("/trees/8b0c6c2e-3f5a-4b4e-9f0c-2f6a1d9e7c11");
    trackPageview("/unknown/path");

    expect(calls).toHaveLength(2);
    const first = (calls[0][0] as (props: Record<string, unknown>) => Record<string, unknown>)({
      title: "family-tree",
    });
    const second = (calls[1][0] as (props: Record<string, unknown>) => Record<string, unknown>)({
      title: "family-tree",
    });
    expect(first.url).toBe("https://family-tree.page/invite");
    expect(second.url).toBe("https://family-tree.page/app");
    vi.unstubAllGlobals();
  });
});
