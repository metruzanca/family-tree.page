import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { CalendarDays, MapPin, X } from "lucide-solid";
import type { GraphPerson, GraphRelationship, TreeGraph } from "~/api/people-server";
import { buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/LocaleProvider";
import { formatYears } from "~/lib/format";
import { demoPersonAvatar } from "./demo-tree";

type LandingPersonCardProps = {
  person: GraphPerson;
  data: TreeGraph;
  onClose: () => void;
  onSelectPerson: (id: string) => void;
};

type Relation = {
  relationship: GraphRelationship;
  person: GraphPerson;
};

export function LandingPersonCard(props: LandingPersonCardProps) {
  const { t, locale } = useI18n();
  const peopleById = createMemo(
    () => new Map(props.data.people.map(person => [person.id, person])),
  );

  const relations = createMemo(() => {
    const id = props.person.id;
    const parents: Relation[] = [];
    const children: Relation[] = [];
    const partners: Relation[] = [];
    for (const relationship of props.data.relationships) {
      if (relationship.type === "parent") {
        if (relationship.target === id) {
          const person = peopleById().get(relationship.source);
          if (person) parents.push({ relationship, person });
        }
        if (relationship.source === id) {
          const person = peopleById().get(relationship.target);
          if (person) children.push({ relationship, person });
        }
      } else {
        if (relationship.source !== id && relationship.target !== id) continue;
        const otherId = relationship.source === id ? relationship.target : relationship.source;
        const person = peopleById().get(otherId);
        if (person) partners.push({ relationship, person });
      }
    }
    return { parents, children, partners };
  });

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  function partnerLabel(status: string) {
    switch (status) {
      case "married":
        return t("person.partnership.married");
      case "divorced":
        return t("person.partnership.divorced");
      case "separated":
        return t("person.partnership.separated");
      case "widowed":
        return t("person.partnership.widowed");
      case "partnered":
        return t("person.partnership.partnered");
      default:
        return t("person.partner.unknown");
    }
  }

  return (
    <>
      <div
        class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sm:hidden"
        aria-hidden="true"
        onClick={props.onClose}
      />
      <aside
        class="fixed inset-x-0 bottom-0 z-50 flex max-h-[84dvh] flex-col overflow-hidden rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-16 sm:max-h-none sm:w-[21rem] sm:rounded-3xl"
        aria-label={t("landing.person.profileAria", { name: props.person.displayName })}
      >
        <div class="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
          <Portrait person={props.person} size={62} />
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl leading-tight tracking-tight">
              {props.person.displayName}
            </h2>
            <Show when={formatYears(props.person.birthDate, props.person.deathDate, locale())}>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays size={12} />
                {formatYears(props.person.birthDate, props.person.deathDate, locale())}
              </p>
            </Show>
            <Show when={props.person.birthPlace ?? props.person.deathPlace}>
              <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <MapPin size={12} />
                {props.person.birthPlace ?? props.person.deathPlace}
              </p>
            </Show>
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label={t("landing.person.close")}
            onClick={props.onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Show when={props.person.bio}>
            <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {props.person.bio}
            </p>
          </Show>

          <div class="mt-5 space-y-4">
            <RelationGroup
              title={t("person.panel.parents")}
              entries={relations().parents}
              onSelect={props.onSelectPerson}
              empty={t("landing.person.noParents")}
            />
            <RelationGroup
              title={t("person.panel.partners")}
              entries={relations().partners}
              onSelect={props.onSelectPerson}
              empty={t("landing.person.noPartners")}
              labelFor={entry =>
                entry.relationship.type === "partner" ? partnerLabel(entry.relationship.status) : ""
              }
            />
            <RelationGroup
              title={t("person.panel.children")}
              entries={relations().children}
              onSelect={props.onSelectPerson}
              empty={t("landing.person.noChildren")}
            />
          </div>
        </div>

        <div class="border-t border-border px-5 py-3">
          <A href="/register" class={buttonVariants({ size: "sm", class: "w-full" })}>
            {t("landing.person.startTree")}
          </A>
          <p class="mt-2 text-center text-[0.65rem] leading-relaxed text-muted-foreground">
            {t("landing.person.demoNote")}
          </p>
        </div>
      </aside>
    </>
  );
}

function RelationGroup(props: {
  title: string;
  entries: Relation[];
  onSelect: (id: string) => void;
  empty: string;
  labelFor?: (entry: Relation) => string;
}) {
  return (
    <section>
      <h3 class="field-label">{props.title}</h3>
      <Show
        when={props.entries.length}
        fallback={<p class="mt-1 text-xs text-muted-foreground">{props.empty}</p>}
      >
        <ul class="mt-1.5 space-y-0.5">
          <For each={props.entries}>
            {entry => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-xl px-1 py-1 text-left transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  onClick={() => props.onSelect(entry.person.id)}
                >
                  <Portrait person={entry.person} size={30} />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">
                      {entry.person.displayName}
                    </span>
                    <Show when={props.labelFor?.(entry)}>
                      <span class="block text-[0.68rem] text-muted-foreground">
                        {props.labelFor?.(entry)}
                      </span>
                    </Show>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function Portrait(props: { person: GraphPerson; size: number }) {
  const src = () => demoPersonAvatar(props.person);
  return (
    <span
      class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary"
      style={{ width: `${props.size}px`, height: `${props.size}px` }}
    >
      <Show when={src()}>
        <img src={src()!} alt="" class="h-full w-full object-cover" draggable={false} />
      </Show>
    </span>
  );
}

