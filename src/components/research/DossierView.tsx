import { For, Show, createMemo, type JSX } from "solid-js";
import { formatFuzzyDate, formatFuzzyYearRange } from "~/lib/fuzzy-date";
import { personEventKindLabel } from "~/lib/person-events";
import {
  personName,
  type ResearchIndex,
} from "~/lib/research/graph";
import type { PersonDossier, TimelineItem } from "~/lib/research/dossier";
import { describeKinship, pathLabel } from "~/lib/research/kinship";
import { researchHref } from "./views";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/badge";
import { PersonLine } from "./PersonLine";

export function DossierView(props: {
  treeId: string;
  index: ResearchIndex;
  dossier: PersonDossier;
  viewerPersonId: string | null;
}) {
  const person = () => props.dossier.person;

  const kinship = createMemo(() => {
    const viewerId = props.viewerPersonId;
    if (!viewerId || viewerId === person().id) return null;
    return describeKinship(props.index, viewerId, person().id);
  });

  const partnerNote = (link: PersonDossier["partners"][number]) => {
    const shared = link.children.length;
    const status =
      link.status.charAt(0).toUpperCase() + link.status.slice(1);
    return shared
      ? `${status} · ${shared} ${shared === 1 ? "child" : "children"}`
      : status;
  };

  return (
    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div class="space-y-5">
        <section
          class="rounded-3xl border border-border bg-card p-5 shadow-card print:break-inside-avoid"
          data-testid="research-dossier"
        >
          <div class="flex flex-wrap items-start gap-4">
            <Avatar name={person().displayName} fileId={person().avatarFileId} size={64} />
            <div class="min-w-0 flex-1">
              <h2 class="font-display text-3xl leading-tight tracking-tight">
                {personName(person())}
              </h2>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <Show when={person().maidenName}>
                  <span>née {person().maidenName}</span>
                </Show>
                <Show when={person().nickname}>
                  <span>known as {person().nickname}</span>
                </Show>
                <Show when={props.dossier.lifespan}>
                  <span>{props.dossier.lifespan}</span>
                </Show>
                <Show when={props.dossier.ageAtDeath !== null}>
                  <span>
                    aged {props.dossier.ageAtDeath}
                    {props.dossier.ageAtDeathApproximate ? " (approx.)" : ""}
                  </span>
                </Show>
              </div>

              <Show when={kinship()}>
                {result => (
                  <div
                    class="mt-3 rounded-2xl border border-dashed border-border bg-muted/40 px-3.5 py-2.5"
                    data-testid="research-kinship"
                  >
                    <p class="text-sm">
                      Relative to you:{" "}
                      <span class="font-semibold">{result().label}</span>
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">{result().detail}</p>
                    <Show when={result().path.length > 1}>
                      <p class="mt-1 text-xs text-muted-foreground">{pathLabel(result().path)}</p>
                    </Show>
                  </div>
                )}
              </Show>

              <Show when={person().bio}>
                <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {person().bio}
                </p>
              </Show>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-border bg-card p-5 shadow-card print:break-inside-avoid">
          <div class="mb-3 flex items-baseline justify-between gap-3">
            <h3 class="text-sm font-semibold">Chronology</h3>
            <span class="text-xs text-muted-foreground">
              {props.dossier.timeline.length}{" "}
              {props.dossier.timeline.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <Show
            when={props.dossier.timeline.length}
            fallback={
              <p class="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                No dates or life events recorded yet.
              </p>
            }
          >
            <ol class="space-y-1" data-testid="research-timeline">
              <For each={props.dossier.timeline}>
                {item => <TimelineRow item={item} />}
              </For>
            </ol>
          </Show>
        </section>

        <Show when={props.dossier.files.length}>
          <section class="rounded-3xl border border-border bg-card p-5 shadow-card">
            <h3 class="mb-3 text-sm font-semibold">Photos and documents</h3>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
              <For each={props.dossier.files}>
                {file => (
                  <figure
                    class="overflow-hidden rounded-xl border border-border bg-muted"
                    data-testid={`research-media-${file.id}`}
                  >
                    <Show
                      when={file.kind === "image"}
                      fallback={
                        <div class="grid aspect-square place-items-center p-2 text-center text-[0.65rem] text-muted-foreground">
                          {file.name}
                        </div>
                      }
                    >
                      <img
                        src={file.thumbUrl ?? `/api/files/${file.id}/thumb`}
                        alt={file.name}
                        class="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                    </Show>
                  </figure>
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>

      <aside class="space-y-4">
        <SideSection title="Parents" empty="No parents recorded" isEmpty={!props.dossier.parents.length}>
          <For each={props.dossier.parents}>
            {parent => (
              <PersonLine
                person={parent.person}
                href={researchHref(props.treeId, "dossier", parent.person.id)}
                note={`Parent · ${parent.parentType}`}
                compact
                testId={`research-dossier-parent-${parent.person.id}`}
              />
            )}
          </For>
        </SideSection>

        <SideSection title="Partners" empty="No partners recorded" isEmpty={!props.dossier.partners.length}>
          <For each={props.dossier.partners}>
            {partner => (
              <PersonLine
                person={partner.person}
                href={researchHref(props.treeId, "dossier", partner.person.id)}
                note={partnerNote(partner)}
                compact
                testId={`research-dossier-partner-${partner.person.id}`}
              />
            )}
          </For>
        </SideSection>

        <SideSection title="Children" empty="No children recorded" isEmpty={!props.dossier.children.length}>
          <For each={props.dossier.children}>
            {child => (
              <PersonLine
                person={child}
                href={researchHref(props.treeId, "dossier", child.id)}
                note={formatFuzzyYearRange(child.birthDate, child.deathDate)}
                compact
                testId={`research-dossier-child-${child.id}`}
              />
            )}
          </For>
        </SideSection>

        <SideSection title="Siblings" empty="No siblings recorded" isEmpty={!props.dossier.siblings.length}>
          <For each={props.dossier.siblings}>
            {sibling => (
              <PersonLine
                person={sibling}
                href={researchHref(props.treeId, "dossier", sibling.id)}
                note={formatFuzzyYearRange(sibling.birthDate, sibling.deathDate)}
                compact
                testId={`research-dossier-sibling-${sibling.id}`}
              />
            )}
          </For>
        </SideSection>

        <section
          class="rounded-2xl border border-border bg-card p-4"
          data-testid="research-dossier-missing"
        >
          <h3 class="text-sm font-semibold">Open questions</h3>
          <Show
            when={props.dossier.missing.length}
            fallback={
              <p class="mt-2 text-xs text-muted-foreground">
                Every field this desk can check is filled in.
              </p>
            }
          >
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={props.dossier.missing}>
                {gap => <Badge variant="outline">{gap}</Badge>}
              </For>
            </div>
          </Show>
        </section>
      </aside>
    </div>
  );
}

function SideSection(props: {
  title: string;
  empty: string;
  isEmpty?: boolean;
  children: JSX.Element;
}) {
  return (
    <section class="rounded-2xl border border-border bg-card p-3">
      <h3 class="px-1.5 text-sm font-semibold">{props.title}</h3>
      <Show
        when={!props.isEmpty}
        fallback={<p class="px-1.5 pt-1 text-xs text-muted-foreground">{props.empty}</p>}
      >
        <div class="mt-1 space-y-0.5">{props.children}</div>
      </Show>
    </section>
  );
}

function TimelineRow(props: { item: TimelineItem }) {
  return (
    <li
      class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-xl px-2 py-2 odd:bg-muted/40"
      data-testid={`research-timeline-item-${props.item.id}`}
    >
      <span class="text-xs text-muted-foreground">
        {formatFuzzyDate(props.item.date) || "No date"}
      </span>
      <div class="min-w-0">
        <p class="text-sm font-medium">
          {props.item.label}
          <Show when={props.item.kind === "event"}>
            <span class="ml-1.5 text-xs font-normal text-muted-foreground">
              {props.item.eventKind ? personEventKindLabel(props.item.eventKind) : "Event"}
            </span>
          </Show>
        </p>
        <Show when={props.item.place}>
          <p class="text-xs text-muted-foreground">{props.item.place}</p>
        </Show>
        <Show when={props.item.description}>
          <p class="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {props.item.description}
          </p>
        </Show>
      </div>
    </li>
  );
}
