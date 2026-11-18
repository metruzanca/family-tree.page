import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { GraphPerson, GraphPersonEvent } from "~/api/people-server";
import { formatFuzzyDate } from "~/lib/fuzzy-date";
import { personEventKindLabel } from "~/lib/person-events";
import {
  eventsOf,
  familyLabel,
  partnersOf,
  personName,
  type FamilyUnit,
  type ResearchIndex,
} from "~/lib/research/graph";
import { researchHref } from "./views";
import { Avatar } from "../ui/Avatar";

const PARTNERSHIP_LABEL: Record<string, string> = {
  married: "Married",
  partnered: "Partners",
  divorced: "Divorced",
  separated: "Separated",
  widowed: "Widowed",
  unknown: "Relationship",
};

export function FamilyGroupSheet(props: {
  treeId: string;
  index: ResearchIndex;
  families: FamilyUnit[];
  personId: string;
}) {
  const [selectedKey, setSelectedKey] = createSignal("");

  createEffect(() => {
    const families = props.families;
    setSelectedKey(current =>
      families.some(family => family.key === current)
        ? current
        : (families[0]?.key ?? ""),
    );
  });

  const unit = createMemo(
    () => props.families.find(family => family.key === selectedKey()) ?? null,
  );

  return (
    <section class="rounded-3xl border border-border bg-card shadow-card print:break-inside-avoid">
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p class="eyebrow">Family group sheet</p>
          <h2 class="mt-1 font-display text-2xl tracking-tight">
            {unit() ? familyLabel(unit()!) : "No family recorded"}
          </h2>
        </div>
        <Show when={props.families.length > 1}>
          <label class="flex flex-col gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Family
            <select
              class="input min-w-[15rem] text-sm normal-case tracking-normal"
              value={selectedKey()}
              onChange={event => setSelectedKey(event.currentTarget.value)}
              data-testid="research-family-select"
            >
              <For each={props.families}>
                {family => <option value={family.key}>{familyLabel(family)}</option>}
              </For>
            </select>
          </label>
        </Show>
      </div>

      <Show
        when={unit()}
        fallback={
          <div class="px-5 py-10 text-center text-sm text-muted-foreground">
            This person has no recorded parents, partners, or children yet.
          </div>
        }
      >
        {family => (
          <div class="space-y-5 px-5 py-5" data-testid="research-group-sheet">
            <div class="grid gap-4 sm:grid-cols-2">
              <For each={family().parents}>
                {parent => (
                  <ParentCard
                    parent={parent}
                    events={eventsOf(props.index, parent.id)}
                    href={researchHref(props.treeId, "dossier", parent.id)}
                  />
                )}
              </For>
            </div>

            <Show when={family().partnership}>
              {partnership => (
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span class="font-semibold">
                    {PARTNERSHIP_LABEL[partnership().status] ?? "Relationship"}
                  </span>
                  <Show when={partnership().startDate}>
                    <span class="text-muted-foreground">
                      from {formatFuzzyDate(partnership().startDate)}
                    </span>
                  </Show>
                  <Show when={partnership().endDate}>
                    <span class="text-muted-foreground">
                      to {formatFuzzyDate(partnership().endDate)}
                    </span>
                  </Show>
                </div>
              )}
            </Show>

            <div>
              <div class="mb-2 flex items-baseline justify-between gap-3">
                <h3 class="text-sm font-semibold">Children</h3>
                <span class="text-xs text-muted-foreground">
                  {family().children.length} recorded
                </span>
              </div>
              <Show
                when={family().children.length}
                fallback={
                  <p class="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    No children recorded for this family.
                  </p>
                }
              >
                <div class="overflow-x-auto">
                  <table class="w-full min-w-[34rem] border-collapse text-sm">
                    <thead>
                      <tr class="border-b border-border text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                        <th class="w-8 py-2 pr-2 font-semibold">#</th>
                        <th class="py-2 pr-3 font-semibold">Child</th>
                        <th class="py-2 pr-3 font-semibold">Born</th>
                        <th class="py-2 pr-3 font-semibold">Died</th>
                        <th class="py-2 font-semibold">Partner</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={family().children}>
                        {(child, position) => (
                          <tr
                            class="border-b border-border/60 last:border-0"
                            data-testid={`research-child-row-${child.id}`}
                          >
                            <td class="py-2 pr-2 text-xs text-muted-foreground">
                              {position() + 1}
                            </td>
                            <td class="py-2 pr-3">
                              <a
                                href={researchHref(props.treeId, "dossier", child.id)}
                                class="font-medium hover:underline"
                                data-testid={`research-child-link-${child.id}`}
                              >
                                {personName(child)}
                              </a>
                              <Show when={child.maidenName}>
                                <span class="ml-1.5 text-xs text-muted-foreground">
                                  née {child.maidenName}
                                </span>
                              </Show>
                            </td>
                            <td class="py-2 pr-3 text-muted-foreground">
                              {formatFuzzyDate(child.birthDate) || "Not recorded"}
                            </td>
                            <td class="py-2 pr-3 text-muted-foreground">
                              {formatFuzzyDate(child.deathDate) || "Not recorded"}
                            </td>
                            <td class="py-2 text-muted-foreground">
                              {partnersOf(props.index, child.id)
                                .map(link => personName(link.person))
                                .join(", ") || "Not recorded"}
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </section>
  );
}

function ParentCard(props: {
  parent: GraphPerson;
  events: GraphPersonEvent[];
  href: string;
}) {
  return (
    <article
      class="rounded-2xl border border-border bg-background/50 p-4 print:break-inside-avoid"
      data-testid={`research-parent-card-${props.parent.id}`}
    >
      <div class="flex items-start gap-3">
        <Avatar name={props.parent.displayName} fileId={props.parent.avatarFileId} size={44} />
        <div class="min-w-0">
          <a
            href={props.href}
            class="font-display text-xl leading-tight hover:underline"
            data-testid={`research-parent-link-${props.parent.id}`}
          >
            {personName(props.parent)}
          </a>
          <Show when={props.parent.maidenName}>
            <p class="text-xs text-muted-foreground">née {props.parent.maidenName}</p>
          </Show>
          <Show when={props.parent.nickname}>
            <p class="text-xs text-muted-foreground">
              known as {props.parent.nickname}
            </p>
          </Show>
        </div>
      </div>

      <dl class="mt-3 space-y-1.5 text-sm">
        <div class="flex gap-2">
          <dt class="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Born
          </dt>
          <dd>
            {formatFuzzyDate(props.parent.birthDate) || "Not recorded"}
            <Show when={props.parent.birthPlace}>
              <span class="text-muted-foreground">, {props.parent.birthPlace}</span>
            </Show>
          </dd>
        </div>
        <div class="flex gap-2">
          <dt class="w-12 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Died
          </dt>
          <dd>
            {formatFuzzyDate(props.parent.deathDate) || "Not recorded"}
            <Show when={props.parent.deathPlace}>
              <span class="text-muted-foreground">, {props.parent.deathPlace}</span>
            </Show>
          </dd>
        </div>
      </dl>

      <Show when={props.events.length}>
        <ul class="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm">
          <For each={props.events}>
            {event => (
              <li class="flex gap-2">
                <span class="w-12 shrink-0 text-xs text-muted-foreground">
                  {formatFuzzyDate(event.date) || "No date"}
                </span>
                <span>
                  {event.title || personEventKindLabel(event.kind)}
                  <Show when={event.place}>
                    <span class="text-muted-foreground">, {event.place}</span>
                  </Show>
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={props.parent.bio}>
        <p class="mt-3 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">
          {props.parent.bio}
        </p>
      </Show>
    </article>
  );
}
