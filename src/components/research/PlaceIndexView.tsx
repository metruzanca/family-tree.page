import { For, Show, createMemo, createSignal } from "solid-js";
import { MapPin, Search } from "lucide-solid";
import { formatFuzzyDate } from "~/lib/fuzzy-date";
import { personName } from "~/lib/research/graph";
import type { PlaceEntry, PlaceIndex } from "~/lib/research/indexes";
import { useI18n } from "~/i18n/LocaleProvider";
import { researchHref } from "./views";

export function PlaceIndexView(props: {
  treeId: string;
  index: PlaceIndex;
}) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");
  const needle = createMemo(() => query().trim().toLowerCase());

  const filtered = createMemo(() => {
    const term = needle();
    if (!term) return props.index.places;
    return props.index.places.filter(group => {
      if (group.label.toLowerCase().includes(term)) return true;
      if (group.parts.some(part => part.toLowerCase().includes(term))) return true;
      return group.entries.some(entry =>
        personName(entry.person).toLowerCase().includes(term),
      );
    });
  });

  return (
    <div class="space-y-4">
      <div class="grid gap-2 sm:grid-cols-3">
        <Stat label={t("research.places.recorded")} value={props.index.places.length} />
        <Stat label={t("research.places.missingBirths")} value={props.index.missing.births} />
        <Stat label={t("research.places.missingEvents")} value={props.index.missing.events} />
      </div>

      <div class="rounded-2xl border border-border bg-card px-4 py-3">
        <label class="relative block">
          <Search
            size={15}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            class="input pl-9"
            placeholder={t("research.places.filter")}
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            data-testid="research-place-search"
          />
        </label>
      </div>

      <Show
        when={filtered().length}
        fallback={
          <div
            class="rounded-3xl border border-dashed border-border p-10 text-center"
            data-testid="research-place-empty"
          >
            <MapPin class="mx-auto text-muted-foreground" />
            <p class="mt-3 text-sm font-medium">{t("research.places.emptyTitle")}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {t("research.places.emptyBody")}
            </p>
          </div>
        }
      >
        <div class="space-y-2" data-testid="research-place-list">
          <For each={filtered()}>
            {(group, position) => (
              <details
                class="group rounded-2xl border border-border bg-card"
                data-testid={`research-place-row-${position()}`}
              >
                <summary class="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                  <span class="min-w-0">
                    <span class="font-semibold">{group.label}</span>
                    <Show when={group.parts.length > 1}>
                      <span class="ml-2 text-xs text-muted-foreground">
                        {group.parts.slice().reverse().join(" < ")}
                      </span>
                    </Show>
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {t("common.record", { count: group.entries.length })} ·{" "}
                    {t("common.person", { count: group.peopleCount })}
                  </span>
                </summary>
                <ul class="border-t border-border px-4 py-2">
                  <For each={group.entries}>
                    {(entry, entryPosition) => (
                      <PlaceRow
                        entry={entry}
                        treeId={props.treeId}
                        testId={`research-place-entry-${position()}-${entryPosition()}`}
                      />
                    )}
                  </For>
                </ul>
              </details>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.index.missing.people.length}>
        <section class="rounded-2xl border border-dashed border-border bg-muted/40 p-4">
          <h2 class="text-sm font-semibold">{t("research.places.missingTitle")}</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            {props.index.missing.people
              .slice(0, 12)
              .map(person => personName(person))
              .join(", ")}
            <Show when={props.index.missing.people.length > 12}>
              {" "}
              {t("common.moreCount", {
                count: props.index.missing.people.length - 12,
              })}
            </Show>
          </p>
        </section>
      </Show>
    </div>
  );
}

function PlaceRow(props: {
  entry: PlaceEntry;
  treeId: string;
  testId: string;
}) {
  const { t, locale } = useI18n();
  return (
    <li
      class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/60 py-1.5 text-sm last:border-0"
      data-testid={props.testId}
    >
      <span class="min-w-0">
        <a
          href={researchHref(props.treeId, "dossier", props.entry.person.id)}
          class="font-medium hover:underline"
          data-testid={`${props.testId}-person`}
        >
          {personName(props.entry.person)}
        </a>
        <span class="ml-2 text-xs text-muted-foreground">
          {props.entry.labelKey ? t(props.entry.labelKey) : props.entry.label}
        </span>
      </span>
      <span class="text-xs text-muted-foreground">
        {formatFuzzyDate(props.entry.date, { locale: locale() }) ||
          t("research.noDate")}
      </span>
    </li>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div class="rounded-2xl border border-border bg-card px-4 py-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p class="mt-0.5 font-display text-2xl tracking-tight">{props.value}</p>
    </div>
  );
}
