import { A } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { Moon, Sun } from "lucide-solid";
import { useTheme } from "../ui/Theme";
import { IconButton } from "../ui/icon-button";
import { useI18n } from "../../i18n/LocaleProvider";
import { LocaleSwitcher } from "../../i18n/LocaleSwitcher";
import { Trans } from "../../i18n/Trans";

export function AuthLayout(props: {
  title: string;
  subtitle: string;
  children: JSX.Element;
  footer: JSX.Element;
  notice?: string;
}) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <main class="page-shell grid min-h-[100dvh] lg:grid-cols-[1.05fr_0.95fr]">
      <section class="relative hidden overflow-hidden bg-[#1a2418] p-10 text-[#f5efe2] lg:flex lg:flex-col lg:justify-between">
        <div class="absolute inset-0 opacity-70">
          <div class="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#c49a45]/20 blur-3xl" />
          <div class="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-[#8fa98f]/20 blur-3xl" />
          <div class="absolute left-1/3 top-1/2 h-56 w-56 rounded-full bg-[#bf6247]/15 blur-3xl" />
        </div>
        <div class="relative">
          <A href="/" class="inline-flex items-center gap-3">
            <span class="grid h-11 w-11 place-items-center rounded-2xl bg-[#f5efe2] text-[#22331f]">
              <svg viewBox="0 0 64 64" class="h-7 w-7" aria-hidden="true">
                <path d="M32 52V30" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
                <path d="M32 33c0-9-7-16-16-16 0 9 7 16 16 16Z" fill="#c49a45" />
                <path d="M32 29c0-8 6-14 14-14 0 8-6 14-14 14Z" fill="#8fa98f" />
                <path d="M32 39c-7 0-12 4-14 10 7 1 12-3 14-10Z" fill="#bf6247" />
              </svg>
            </span>
            <span class="font-display text-2xl tracking-tight">family-tree</span>
          </A>
        </div>
        <div class="relative max-w-lg">
          <p class="font-display text-4xl leading-[1.12] tracking-tight xl:text-5xl">
            {t("auth.layout.tagline")}
          </p>
          <p class="mt-6 max-w-md text-sm leading-relaxed text-[#cfd6c6]">
            {t("auth.layout.taglineBody")}
          </p>
        </div>
        <div class="relative flex items-center gap-3 text-xs text-[#aeb8a4]">
          <span class="h-px w-10 bg-[#aeb8a4]/50" />
          <span>{t("auth.layout.privateByDefault")}</span>
        </div>
      </section>

      <section class="flex min-h-[100dvh] flex-col px-5 py-6 sm:px-10">
        <div class="flex items-center justify-between">
          <A href="/" class="flex items-center gap-2 lg:invisible">
            <span class="grid h-9 w-9 place-items-center rounded-xl bg-[#22331f] text-[#f5efe2]">
              <svg viewBox="0 0 64 64" class="h-5 w-5" aria-hidden="true">
                <path d="M32 52V30" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
                <path d="M32 33c0-9-7-16-16-16 0 9 7 16 16 16Z" fill="#c49a45" />
                <path d="M32 29c0-8 6-14 14-14 0 8-6 14-14 14Z" fill="#8fa98f" />
              </svg>
            </span>
            <span class="font-display text-xl">family-tree</span>
          </A>
          <div class="flex items-center gap-1">
            <div data-testid="auth-locale-switcher">
              <LocaleSwitcher variant="text" />
            </div>
            <IconButton
              label={theme() === "dark" ? t("header.lightTheme") : t("header.darkTheme")}
              onClick={toggle}
            >
              <Show when={theme() === "dark"} fallback={<Moon size={18} />}>
                <Sun size={18} />
              </Show>
            </IconButton>
          </div>
        </div>

        <div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <Show when={props.notice}>
            <div class="mb-5 rounded-2xl border border-border bg-accent px-4 py-3 text-sm text-foreground">
              {props.notice}
            </div>
          </Show>
          <h1 class="font-display text-3xl tracking-tight sm:text-4xl">{props.title}</h1>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{props.subtitle}</p>
          <div class="mt-8">{props.children}</div>
          <div class="mt-6 text-sm text-muted-foreground">{props.footer}</div>
        </div>

        <div class="mt-5 space-y-1 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
          <p>{t("auth.layout.dataPrivacy")}</p>
          <p>
            <Trans
              key="auth.layout.legal"
              components={{
                privacy: (
                  <A
                    href="/privacy"
                    class="underline decoration-border underline-offset-2 transition hover:text-foreground"
                  >
                    {t("auth.layout.privacyPolicy")}
                  </A>
                ),
                terms: (
                  <A
                    href="/terms"
                    class="underline decoration-border underline-offset-2 transition hover:text-foreground"
                  >
                    {t("auth.layout.terms")}
                  </A>
                ),
              }}
            />
          </p>
        </div>
      </section>
    </main>
  );
}
