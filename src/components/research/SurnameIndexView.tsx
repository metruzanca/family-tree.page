import { For, Show, createMemo, createSignal } from "solid-js";
import { Search } from "lucide-solid";
import { personName } from "~/lib/research/graph";
import type { SurnameGroup } from "~/lib/research/indexes";
import { useI18n } from "~/i18n/LocaleProvider";
import { researchHref, slugify } from "./views";
import { Badge } from "../ui/badge";
import { PersonLine } from "./PersonLine";

export function SurnameIndexView(props: {
  treeId: string;
  groups: SurnameGroup[];
}) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");
  const needle = createMemo(() => query().trim().toLowerCase());

  const filtered = createMemo(() => {
    const term = needle();
    if (!term) return props.groups;
    return props.groups.filter(group => {
      if (group.label.toLowerCase().includes(term)) return true;
      if (group.variants.some(variant => variant.surname.toLowerCase().includes(term))) {
        return true;
      }
      return group.people.some(entry =>
        personName(entry.person).toLowerCase().includes(term),
      );
    });
  });

  const peopleCount = createMemo(() =>
    filtered().reduce((total, group) => total + group.people.length, 0),
  );

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <label class="relative min-w-[14rem] flex-1">
          <Search
            size={15}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            class="input pl-9"
            placeholder={t("research.surnames.filter")}
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            data-testid="research-surname-search"
          />
        </label>
        <p class="text-xs text-muted-foreground" data-testid="research-surname-count">
          {t("research.surnames.groupCount", { count: filtered().length })},{" "}
          {t("common.record", { count: peopleCount() })}
        </p>
      </div>

      <Show
        when={filtered().length}
        fallback={
          <div
            class="rounded-3xl border border-dashed border-border p-10 text-center"
            data-testid="research-surname-empty"
          >
            <p class="text-sm font-medium">{t("research.surnames.emptyTitle")}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {t("research.surnames.emptyBody")}
            </p>
          </div>
        }
      >
        <div class="space-y-3" data-testid="research-surname-list">
          <For each={filtered()}>
            {group => (
              <section
                class="rounded-2xl border border-border bg-card p-4"
                data-testid={`research-surname-row-${slugify(group.label)}`}
              >
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 class="font-display text-2xl tracking-tight">{group.label}</h2>
                  <p class="text-xs text-muted-foreground">
                    {t("common.record", { count: group.people.length })}
                    <Show when={group.earliestYear !== null}>
                      {" · "}
                      <Show
                        when={
                          group.latestYear !== null &&
                          group.latestYear !== group.earliestYear
                        }
                        fallback={group.earliestYear}
                      >
                        {t("date.between", {
                          start: group.earliestYear ?? "",
                          end: group.latestYear ?? "",
                        })}
                      </Show>
                    </Show>
                  </p>
                </div>

                <Show when={group.variants.length > 1}>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={group.variants}>
                      {variant => (
                        <Badge variant="outline">
                          {variant.surname}
                          <span class="ml-1 text-muted-foreground">{variant.count}</span>
                        </Badge>
                      )}
                    </For>
                  </div>
                </Show>

                <ul class="mt-3 grid gap-0.5 sm:grid-cols-2">
                  <For each={group.people}>
                    {entry => (
                      <li>
                        <PersonLine
                          person={entry.person}
                          href={researchHref(props.treeId, "dossier", entry.person.id)}
                          note={t("research.surnames.recordedAs", {
                            surname: entry.surname,
                          })}
                          compact
                          testId={`research-surname-person-${entry.person.id}-${slugify(entry.surname)}`}
                        />
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
