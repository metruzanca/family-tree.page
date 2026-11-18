import en from "./en.json";
import it from "./it.json";

export const LOCALES = ["en", "it"] as const;

export type Locale = (typeof LOCALES)[number];

/** Non-HTTP-only so the client can read the same value the server rendered. */
export const LOCALE_COOKIE = "family_tree_locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export const DEFAULT_LOCALE: Locale = "en";

export type RawTranslationKey = keyof typeof en;

/** Plural families expose their base key, e.g. `common.person` with `{ count }`. */
type PluralBase<K> = K extends `${infer Base}.one` ? Base : never;

export type TranslationKey = RawTranslationKey | PluralBase<RawTranslationKey>;
export type TranslationParams = Record<string, string | number>;

/**
 * `it` is deliberately typed against the English dictionary: a missing or
 * extra key fails `pnpm typecheck` before a user ever sees a fallback.
 */
const italian: Record<RawTranslationKey, string> = it;

const dictionaries: Record<Locale, Record<string, string>> = {
  en,
  it: italian,
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * True when a string is a key in the English dictionary, including the base key
 * of a plural family. Server code uses this to tell a key apart from a message
 * that is already written out, such as one from a library.
 */
export function hasTranslationKey(value: string): value is TranslationKey {
  return (
    Object.hasOwn(en, value) ||
    Object.hasOwn(en, `${value}.one`) ||
    Object.hasOwn(en, `${value}.many`) ||
    Object.hasOwn(en, `${value}.other`)
  );
}

/** `it-IT`, `it-CH`, `IT` and `it` all become `it`. */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

function qualityOf(part: string) {
  const match = /;\s*q=([0-9.]+)/i.exec(part);
  return match ? Number(match[1]) : 1;
}

/** Parses an `Accept-Language` header, respecting q-values. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const entries = header
    .split(",")
    .map(part => ({ part, quality: qualityOf(part) }))
    .filter(entry => Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  for (const { part } of entries) {
    const language = part.split(";")[0]?.trim();
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return null;
}

export function localeFromLanguages(
  languages: readonly string[] | null | undefined,
): Locale | null {
  for (const language of languages ?? []) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return null;
}

/** Reads one cookie from a `Cookie` header or `document.cookie` string. */
export function cookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

/**
 * Locale precedence: saved cookie, then the browser's languages, then English.
 * The server and client use the same order so hydration sees the same locale.
 */
export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  languages?: readonly string[] | null;
}): Locale {
  const saved = normalizeLocale(cookieValue(input.cookie, LOCALE_COOKIE));
  if (saved) return saved;
  return (
    localeFromAcceptLanguage(input.acceptLanguage) ??
    localeFromLanguages(input.languages) ??
    DEFAULT_LOCALE
  );
}

/** Resolves the locale for a server request without touching Solid internals. */
export function resolveLocaleFromHeaders(headers: Headers): Locale {
  return resolveLocale({
    cookie: headers.get("cookie"),
    acceptLanguage: headers.get("accept-language"),
  });
}

function interpolate(template: string, params: TranslationParams | undefined) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function lookup(locale: Locale, key: string): string | undefined {
  return dictionaries[locale][key];
}

/**
 * Translates a key. A numeric `count` selects plural forms such as
 * `key.one` / `key.many` / `key.other`; otherwise the key itself is used.
 * Unknown keys fall back to English, then to the key itself.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  let template: string | undefined;
  const count = params?.count;

  if (typeof count === "number") {
    const category = new Intl.PluralRules(locale).select(count);
    template = lookup(locale, `${key}.${category}`) ?? lookup(locale, `${key}.other`);
  }

  template ??= lookup(locale, key);

  if (template === undefined && locale !== DEFAULT_LOCALE) {
    template = lookup(DEFAULT_LOCALE, key);
  }

  if (template === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation for "${key}" (${locale})`);
    }
    return key;
  }

  return interpolate(template, params);
}

/** The BCP 47 tag handed to Intl formatters. */
export function localeTag(locale: Locale) {
  return locale === "it" ? "it-IT" : "en-US";
}

/**
 * Client-only active locale for utilities that run outside components (upload
 * helpers, action results). The server never writes this, so a request cannot
 * leak its locale into another one; SSR utilities fall back to English.
 */
let clientLocale: Locale = DEFAULT_LOCALE;

export function setClientLocale(locale: Locale) {
  if (import.meta.env.SSR) return;
  clientLocale = locale;
}

export function tClient(key: TranslationKey, params?: TranslationParams) {
  return translate(clientLocale, key, params);
}
