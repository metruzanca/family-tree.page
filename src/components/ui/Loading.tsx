import { For } from "solid-js";
import { Skeleton } from "./skeleton";
import { useI18n } from "~/i18n/LocaleProvider";

export function LoadingScreen(props: { label?: string }) {
  const { t } = useI18n();
  return (
    <div class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6">
      <span class="relative flex size-10 items-center justify-center">
        <span class="absolute inset-0 animate-ping rounded-full bg-primary/15" />
        <span class="size-2.5 rounded-full bg-primary" />
      </span>
      <p class="text-sm text-muted-foreground">{props.label ?? t("loading.tree")}</p>
    </div>
  );
}

export function LoadingRows(props: { count?: number }) {
  return (
    <div class="space-y-2">
      <For each={Array.from({ length: props.count ?? 4 })}>
        {() => <Skeleton class="h-14 w-full rounded-xl" />}
      </For>
    </div>
  );
}

export function LoadingCards(props: { count?: number }) {
  return (
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <For each={Array.from({ length: props.count ?? 3 })}>
        {() => (
          <div class="rounded-[1.25rem] border border-border bg-card p-5">
            <div class="flex items-start justify-between">
              <Skeleton class="size-11 rounded-2xl" />
              <Skeleton class="h-5 w-16 rounded-full" />
            </div>
            <Skeleton class="mt-5 h-6 w-2/3 rounded-md" />
            <Skeleton class="mt-2 h-4 w-full rounded-md" />
            <Skeleton class="mt-2 h-4 w-4/5 rounded-md" />
            <div class="mt-6 flex items-center gap-3 border-t border-border pt-3">
              <Skeleton class="h-3 w-20 rounded-md" />
              <Skeleton class="h-3 w-16 rounded-md" />
              <Skeleton class="ml-auto h-3 w-12 rounded-md" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
