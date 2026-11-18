import { For, Show } from "solid-js";
import type { Pedigree, PedigreeSlot } from "~/lib/research/numbering";
import { pedigreeSlotLabel } from "~/lib/research/numbering";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { personName } from "~/lib/research/graph";
import { useI18n } from "~/i18n/LocaleProvider";
import { researchHref } from "./views";
import { Badge } from "../ui/badge";

export function PedigreeOutline(props: { treeId: string; pedigree: Pedigree }) {
  const { t } = useI18n();
  return (
    <div class="space-y-4" data-testid="research-pedigree">
      <div class="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t("research.pedigree.note")}
      </div>

      <Show when={props.pedigree.truncated}>
        <p class="text-xs text-muted-foreground">
          {t("research.pedigree.truncated", {
            count: props.pedigree.generations.length,
          })}
        </p>
      </Show>

      <For each={props.pedigree.generations}>
        {row => (
          <section
            class="rounded-3xl border border-border bg-card p-4 shadow-card print:break-inside-avoid"
            data-testid={`research-pedigree-generation-${row.generation}`}
          >
            <div class="mb-3 flex items-baseline justify-between gap-3">
              <h2 class="font-display text-xl tracking-tight">
                {t("research.pedigree.generation", { number: row.generation })}
              </h2>
              <span class="text-xs text-muted-foreground">
                {t("research.pedigree.slots", {
                  present: row.slots.filter(slot => slot.person).length,
                  total: row.slots.length,
                })}
              </span>
            </div>
            <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <For each={row.slots}>
                {slot => <PedigreeSlotCard treeId={props.treeId} slot={slot} />}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}

function PedigreeSlotCard(props: { treeId: string; slot: PedigreeSlot }) {
  const { t, locale } = useI18n();
  return (
    <li
      class="rounded-2xl border border-border bg-background/50 px-3 py-2.5"
      data-testid={`research-pedigree-slot-${props.slot.number}`}
    >
      <div class="flex items-start gap-2.5">
        <span class="mt-0.5 inline-flex min-w-9 justify-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
          {props.slot.number}
        </span>
        <div class="min-w-0">
          <Show
            when={props.slot.person}
            fallback={
              <p class="text-sm text-muted-foreground">
                {t("research.pedigree.slotEmpty")}
              </p>
            }
          >
            {person => (
              <>
                <a
                  href={researchHref(props.treeId, "dossier", person().id)}
                  class="block truncate text-sm font-semibold hover:underline"
                  data-testid={`research-pedigree-person-${person().id}`}
                >
                  {personName(person(), locale())}
                </a>
                <p class="text-xs text-muted-foreground">
                  {pedigreeSlotLabel(props.slot, locale())}
                  <Show
                    when={formatFuzzyYearRange(
                      person().birthDate,
                      person().deathDate,
                      locale(),
                    )}
                  >
                    {" · "}
                    {formatFuzzyYearRange(
                      person().birthDate,
                      person().deathDate,
                      locale(),
                    )}
                  </Show>
                </p>
                <Show when={person().birthPlace}>
                  <p class="truncate text-xs text-muted-foreground">{person().birthPlace}</p>
                </Show>
              </>
            )}
          </Show>
          <Show when={props.slot.extraParents.length}>
            <div class="mt-1.5 flex flex-wrap gap-1">
              <Badge variant="outline">
                {t("research.pedigree.extraParents", {
                  count: props.slot.extraParents.length,
                })}
              </Badge>
            </div>
          </Show>
        </div>
      </div>
    </li>
  );
}
