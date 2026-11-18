import { describe, expect, it } from "vitest";
import {
  canBeHomeLink,
  normalizePersonLinkUrl,
  personLinkHostname,
  resolvePersonLink,
} from "./person-links";

describe("normalizePersonLinkUrl", () => {
  it("adds https to a bare domain", () => {
    expect(normalizePersonLinkUrl("instagram.com/name")).toBe(
      "https://instagram.com/name",
    );
    expect(normalizePersonLinkUrl("  example.com  ")).toBe("https://example.com/");
  });

  it("keeps an explicit http address", () => {
    expect(normalizePersonLinkUrl("http://example.com/page")).toBe(
      "http://example.com/page",
    );
  });

  it("rejects non-web protocols and credentials", () => {
    expect(normalizePersonLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePersonLinkUrl("mailto:sam@example.com")).toBeNull();
    expect(normalizePersonLinkUrl("data:text/html,hello")).toBeNull();
    expect(normalizePersonLinkUrl("https://user:secret@example.com")).toBeNull();
  });

  it("rejects values without a host", () => {
    expect(normalizePersonLinkUrl("")).toBeNull();
    expect(normalizePersonLinkUrl("not a link")).toBeNull();
  });
});

describe("resolvePersonLink", () => {
  it("finds a Simple Icons brand from a subdomain", () => {
    const icon = resolvePersonLink("https://www.instagram.com/name", false);
    expect(icon.kind).toBe("brand");
    if (icon.kind === "brand") {
      expect(icon.label).toBe("Instagram");
      expect(icon.slug).toBe("instagram");
      expect(icon.icon.path.length).toBeGreaterThan(100);
    }
  });

  it("uses the host label when Simple Icons has no glyph", () => {
    const icon = resolvePersonLink("https://www.linkedin.com/in/name", false);
    expect(icon).toEqual({ kind: "globe", label: "LinkedIn" });
  });

  it("falls back to a globe for an unknown personal domain", () => {
    expect(resolvePersonLink("https://example.com", false)).toEqual({
      kind: "globe",
      label: "example.com",
    });
  });

  it("uses the house only for an unknown personal domain", () => {
    expect(resolvePersonLink("https://example.com", true)).toEqual({
      kind: "home",
      label: "Personal website",
    });
    expect(resolvePersonLink("https://instagram.com/name", true).kind).toBe(
      "brand",
    );
  });
});

describe("canBeHomeLink", () => {
  it("allows personal domains", () => {
    expect(canBeHomeLink("my-family.example.com")).toBe(true);
  });

  it("refuses recognized platforms, even without an icon", () => {
    expect(canBeHomeLink("instagram.com/name")).toBe(false);
    expect(canBeHomeLink("linkedin.com/in/name")).toBe(false);
  });

  it("refuses empty or invalid values", () => {
    expect(canBeHomeLink("")).toBe(false);
    expect(canBeHomeLink("javascript:alert(1)")).toBe(false);
  });
});

describe("personLinkHostname", () => {
  it("returns a readable hostname", () => {
    expect(personLinkHostname("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(personLinkHostname("nope")).toBeNull();
  });
});
