import { For, Show } from "solid-js";
import type { Pedigree, PedigreeSlot } from "~/lib/research/numbering";
import { pedigreeRoleLabel } from "~/lib/research/numbering";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { personName } from "~/lib/research/graph";
import { researchHref } from "./views";
import { Badge } from "../ui/badge";

export function PedigreeOutline(props: { treeId: string; pedigree: Pedigree }) {
  return (
    <div class="space-y-4" data-testid="research-pedigree">
      <div class="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Ahnentafel numbering: the subject is 1, each parent doubles the number, so
        slots 2 and 3 are the two parents and 4 to 7 are their parents. The tree
        does not record sex, so the slots read as parent A and parent B instead of
        father and mother.
      </div>

      <Show when={props.pedigree.truncated}>
        <p class="text-xs text-muted-foreground">
          The chart stops after {props.pedigree.generations.length} generations. Raise the
          limit to keep walking back.
        </p>
      </Show>

      <For each={props.pedigree.generations}>
        {row => (
          <section
            class="rounded-3xl border border-border bg-card p-4 shadow-card print:break-inside-avoid"
            data-testid={`research-pedigree-generation-${row.generation}`}
          >
            <div class="mb-3 flex items-baseline justify-between gap-3">
              <h2 class="font-display text-xl tracking-tight">Generation {row.generation}</h2>
              <span class="text-xs text-muted-foreground">
                {row.slots.filter(slot => slot.person).length} of {row.slots.length} slots
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
            fallback={<p class="text-sm text-muted-foreground">Slot not recorded</p>}
          >
            {person => (
              <>
                <a
                  href={researchHref(props.treeId, "dossier", person().id)}
                  class="block truncate text-sm font-semibold hover:underline"
                  data-testid={`research-pedigree-person-${person().id}`}
                >
                  {personName(person())}
                </a>
                <p class="text-xs text-muted-foreground">
                  {pedigreeRoleLabel(props.slot.role)}
                  <Show when={formatFuzzyYearRange(person().birthDate, person().deathDate)}>
                    {" · "}
                    {formatFuzzyYearRange(person().birthDate, person().deathDate)}
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
                {props.slot.extraParents.length} more parent
                {props.slot.extraParents.length === 1 ? "" : "s"} not placed
              </Badge>
            </div>
          </Show>
        </div>
      </div>
    </li>
  );
}
