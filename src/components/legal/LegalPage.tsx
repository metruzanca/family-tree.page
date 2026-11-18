import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { BrandMark } from "~/components/app/AppHeader";
import { useI18n } from "~/i18n/LocaleProvider";
import { LocaleSwitcher } from "~/i18n/LocaleSwitcher";
import { formatDate } from "~/lib/format";

export function LegalPage(props: {
  title: string;
  updated: string;
  children: JSX.Element;
}) {
  const { t, locale } = useI18n();
  const updated = () => formatDate(props.updated, locale()) || props.updated;

  return (
    <div class="page-shell min-h-[100dvh]">
      <header class="border-b border-border/80 bg-background/85">
        <div class="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <BrandMark href="/" />
          <nav class="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <A href="/privacy" class="transition hover:text-foreground">
              {t("legal.nav.privacy")}
            </A>
            <A href="/terms" class="transition hover:text-foreground">
              {t("legal.nav.terms")}
            </A>
            <A href="/" class="transition hover:text-foreground">
              {t("common.home")}
            </A>
            <LocaleSwitcher variant="text" />
          </nav>
        </div>
      </header>

      <main class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p class="eyebrow">{t("legal.eyebrow")}</p>
        <h1 class="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          {props.title}
        </h1>
        <p class="mt-3 text-xs text-muted-foreground">
          {t("legal.updated", { date: updated() })}
        </p>
        <p
          class="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          data-testid="legal-language-notice"
        >
          {t("legal.englishOnly")}
        </p>
        <div class="mt-10 space-y-10">{props.children}</div>
      </main>

      <footer class="border-t border-border bg-background/60">
        <div class="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("legal.footer.tagline")}</p>
          <nav class="flex flex-wrap items-center gap-4">
            <A href="/privacy" class="transition hover:text-foreground">
              {t("legal.nav.privacy")}
            </A>
            <A href="/terms" class="transition hover:text-foreground">
              {t("legal.nav.terms")}
            </A>
            <A href="/login" class="transition hover:text-foreground">
              {t("auth.signIn")}
            </A>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection(props: { title: string; children: JSX.Element }) {
  return (
    <section>
      <h2 class="font-display text-2xl tracking-tight">{props.title}</h2>
      <div class="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{props.children}</div>
    </section>
  );
}

export function LegalList(props: { children: JSX.Element }) {
  return <ul class="list-disc space-y-1.5 pl-5">{props.children}</ul>;
}
