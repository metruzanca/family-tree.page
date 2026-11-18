import { A } from "@solidjs/router";
import { ArrowLeft, RefreshCw, Sprout, TriangleAlert } from "lucide-solid";
import { Show } from "solid-js";
import { Button, buttonVariants } from "./button";
import { Card } from "./card";
import { useI18n } from "~/i18n/LocaleProvider";

export type ErrorStateVariant = "page" | "graph" | "inline";

export type ErrorStateProps = {
  title?: string;
  message?: string;
  variant?: ErrorStateVariant;
  retrying?: boolean;
  onRetry?: () => void;
  back?: { href: string; label: string };
};

/**
 * Shared failure UI. Page and graph variants replace a whole route, inline
 * fits inside a card or list, and every variant offers a retry when possible.
 */
export function ErrorState(props: ErrorStateProps) {
  const { t } = useI18n();
  const variant = () => props.variant ?? "page";
  const title = () => props.title ?? t("error.title");
  const message = () => props.message ?? t("error.message");

  const retryButton = (size: "default" | "sm" = "default", className?: string) => (
    <Show when={props.onRetry}>
      <Button
        type="button"
        size={size}
        class={className}
        disabled={props.retrying}
        onClick={() => props.onRetry?.()}
      >
        <RefreshCw class={props.retrying ? "animate-spin" : undefined} />
        {props.retrying ? t("common.retrying") : t("common.retry")}
      </Button>
    </Show>
  );

  return (
    <Show
      when={variant() !== "inline"}
      fallback={
        <div
          role="alert"
          class="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <TriangleAlert size={17} />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-foreground">{title()}</p>
            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{message()}</p>
          </div>
          {retryButton("sm", "shrink-0")}
          <Show when={props.back}>
            {back => (
              <A
                href={back().href}
                class={buttonVariants({ variant: "ghost", size: "sm", class: "shrink-0" })}
              >
                {back().label}
              </A>
            )}
          </Show>
        </div>
      }
    >
      <Show
        when={variant() === "graph"}
        fallback={
          <main class="page-shell grid min-h-[100dvh] place-items-center px-6">
            <Card class="max-w-md items-center gap-0 p-8 text-center">
              <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-accent text-primary">
                <Sprout size={26} />
              </div>
              <h1 class="mt-5 font-display text-3xl tracking-tight">{title()}</h1>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {message()}
              </p>
              <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
                {retryButton()}
                <Show when={props.back}>
                  {back => (
                    <A
                      href={back().href}
                      class={buttonVariants({ variant: "secondary", class: "gap-2" })}
                    >
                      <ArrowLeft size={16} />
                      {back().label}
                    </A>
                  )}
                </Show>
              </div>
            </Card>
          </main>
        }
      >
        <div class="graph-shell relative h-[100dvh] w-full overflow-hidden bg-graph-bg">
          <div class="grid h-full place-items-center px-6">
            <div class="w-full max-w-md rounded-3xl border border-white/10 bg-black/45 p-7 text-center text-white/85 shadow-2xl backdrop-blur-xl">
              <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-white/10 text-gold">
                <TriangleAlert size={27} />
              </div>
              <h1 class="mt-5 font-display text-3xl tracking-tight text-white">{title()}</h1>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/55">
                {message()}
              </p>
              <div class="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Show when={props.onRetry}>
                  <button
                    type="button"
                    class="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gold px-5 text-sm font-semibold text-[#161a12] shadow-sm transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-55"
                    disabled={props.retrying}
                    onClick={() => props.onRetry?.()}
                  >
                    <RefreshCw
                      size={16}
                      class={props.retrying ? "animate-spin" : undefined}
                    />
                    {props.retrying ? t("common.retrying") : t("common.retry")}
                  </button>
                </Show>
                <Show when={props.back}>
                  {back => (
                    <A
                      href={back().href}
                      class="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white/75 transition hover:border-white/30 hover:text-white"
                    >
                      <ArrowLeft size={16} />
                      {back().label}
                    </A>
                  )}
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
}
