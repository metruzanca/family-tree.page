import {
  createContext,
  createSignal,
  onMount,
  useContext,
  type JSX,
} from "solid-js";
import { getRequestEvent } from "solid-js/web";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_MAX_AGE,
  resolveLocale,
  setClientLocale,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from "./index";

type I18nContextValue = {
  locale: () => Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue>();

/** Server render and client hydration must resolve the locale identically. */
function initialLocale(): Locale {
  if (import.meta.env.SSR) {
    const event = getRequestEvent();
    return resolveLocale({
      cookie: event?.request.headers.get("cookie") ?? null,
      acceptLanguage: event?.request.headers.get("accept-language") ?? null,
    });
  }

  if (typeof document === "undefined") return DEFAULT_LOCALE;

  return resolveLocale({
    cookie: document.cookie,
    languages:
      navigator.languages?.length ? navigator.languages : [navigator.language],
  });
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

export function LocaleProvider(props: { children: JSX.Element }) {
  const [locale, setLocaleSignal] = createSignal<Locale>(initialLocale());
  setClientLocale(locale());

  onMount(() => {
    setClientLocale(locale());
    applyDocumentLocale(locale());
  });

  function setLocale(next: Locale) {
    setLocaleSignal(next);
    setClientLocale(next);
    applyDocumentLocale(next);
    if (typeof document === "undefined") return;
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax`;
  }

  const value: I18nContextValue = {
    locale,
    setLocale,
    t: (key, params) => translate(locale(), key, params),
  };

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}
