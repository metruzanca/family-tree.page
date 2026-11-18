import { describe, expect, it } from "vitest";
import english from "./en.json";
import italian from "./it.json";
import {
  localeFromAcceptLanguage,
  normalizeLocale,
  resolveLocale,
  translate,
} from "./index";

const enKeys = Object.keys(english).sort();
const itKeys = Object.keys(italian).sort();

describe("dictionaries", () => {
  it("have exactly the same keys", () => {
    expect(itKeys).toEqual(enKeys);
  });

  it("have no empty values", () => {
    for (const [key, value] of Object.entries({ ...english, ...italian })) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("use the same placeholders in both languages", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

    for (const key of enKeys) {
      const enValue = (english as Record<string, string>)[key];
      const itValue = (italian as Record<string, string>)[key];
      expect(placeholders(itValue), key).toEqual(placeholders(enValue));
    }
  });

  it("have an other form for every singular form", () => {
    for (const key of enKeys) {
      if (key.endsWith(".one")) {
        expect(enKeys, key).toContain(key.replace(/\.one$/, ".other"));
      }
    }
  });
});

describe("locale resolution", () => {
  it("normalizes regional tags", () => {
    expect(normalizeLocale("it-IT")).toBe("it");
    expect(normalizeLocale("EN_gb")).toBe("en");
    expect(normalizeLocale("fr")).toBeNull();
  });

  it("honours accept-language order and q-values", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,it;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,it;q=0.8")).toBe("it");
    expect(localeFromAcceptLanguage("fr-FR")).toBeNull();
  });

  it("prefers the saved cookie over the browser", () => {
    expect(
      resolveLocale({ cookie: "family_tree_locale=it", acceptLanguage: "en-GB" }),
    ).toBe("it");
    expect(
      resolveLocale({
        cookie: "other=1",
        acceptLanguage: "it-IT,it;q=0.9",
      }),
    ).toBe("it");
  });

  it("falls back to English", () => {
    expect(resolveLocale({})).toBe("en");
  });
});

describe("translate", () => {
  it("interpolates parameters", () => {
    expect(translate("en", "common.person", { count: 3 })).toBe("3 people");
    expect(translate("it", "common.person", { count: 3 })).toBe("3 persone");
  });

  it("selects plural forms from the count", () => {
    expect(translate("en", "common.person", { count: 1 })).toBe("1 person");
    expect(translate("it", "common.person", { count: 1 })).toBe("1 persona");
    expect(translate("it", "common.person", { count: 5 })).toBe("5 persone");
  });

  it("falls back to English for unknown Italian keys", () => {
    const key = "common.appName" as const;
    expect(translate("it", key)).toBe("family-tree");
  });
});
