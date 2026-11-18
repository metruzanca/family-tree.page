import { Match, Show, Suspense, Switch, createMemo, createSignal, onMount } from "solid-js";
import { A, createAsync, revalidate, useParams, useSearchParams } from "@solidjs/router";
import { BookOpen, Network, Printer, Search } from "lucide-solid";
import type { GraphPerson, GraphPersonEvent, TreeGraph } from "~/api/people-server";
import { deletePersonEvent } from "~/api/people-server";
import type { PublicUser } from "~/server/auth-service";
import { getTreeGraph, requireUserPage } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { LoadingScreen } from "~/components/ui/Loading";
import { Button, buttonVariants } from "~/components/ui/button";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { useToast } from "~/components/ui/Toast";
import { AddRelativeDialog } from "~/components/people/AddRelativeDialog";
import { PersonEventDialog } from "~/components/people/PersonEventDialog";
import {
  PersonFormDialog,
  type PersonFormField,
} from "~/components/people/PersonFormDialog";
import { DossierView } from "~/components/research/DossierView";
import { DescendantRegisterView } from "~/components/research/DescendantRegisterView";
import type { ResearchEditing } from "~/components/research/editing";
import { FamilyGroupSheet } from "~/components/research/FamilyGroupSheet";
import { PedigreeOutline } from "~/components/research/PedigreeOutline";
import { PersonPicker } from "~/components/research/PersonPicker";
import { PlaceIndexView } from "~/components/research/PlaceIndexView";
import { ResearchIssuesView } from "~/components/research/ResearchIssuesView";
import {
  ResearchNav,
  ResearchViewIntro,
} from "~/components/research/ResearchNav";
import { SurnameIndexView } from "~/components/research/SurnameIndexView";
import {
  DEFAULT_RESEARCH_VIEW,
  isResearchView,
  researchViewLabelKey,
  type ResearchView,
} from "~/components/research/views";
import { formatDate } from "~/lib/format";
import { attemptAction } from "~/lib/action-result";
import { eventPartnerOf } from "~/lib/person-events";
import { useI18n } from "~/i18n/LocaleProvider";
import { buildDossier } from "~/lib/research/dossier";
import {
  buildFamilyUnits,
  buildResearchIndex,
  familiesForPerson,
  personName,
  sortPeopleByBirth,
} from "~/lib/research/graph";
import { buildPlaceIndex, buildSurnameIndex } from "~/lib/research/indexes";
import { buildResearchIssues } from "~/lib/research/issues";
import {
  buildDescendantRegister,
  buildPedigree,
  type RegisterMode,
} from "~/lib/research/numbering";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
  },
};

export default function TreeResearchPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppErrorBoundary
        title={t("research.errorTitle")}
        message={t("tree.error.unavailable")}
        revalidateKeys={[requireUserPage.key, getTreeGraph.key]}
        back={{ href: "/trees", label: t("tree.error.backToTrees") }}
      >
        <TreeResearchInner />
      </AppErrorBoundary>
    </Suspense>
  );
}

function TreeResearchInner() {
  const params = useParams<{ treeId: string }>();
  const user = createAsync(() => requireUserPage());
  const graph = createAsync(() => getTreeGraph(params.treeId));

  return (
    <Show when={user()}>
      {currentUser => (
        <Show when={graph()} fallback={<LoadingScreen />}>
          {data => (
            <ResearchWorkspace user={currentUser()} graph={data()} treeId={params.treeId} />
          )}
        </Show>
      )}
    </Show>
  );
}

function ResearchWorkspace(props: {
  user: PublicUser;
  graph: TreeGraph;
  treeId: string;
}) {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = createMemo<ResearchView>(() =>
    isResearchView(searchParams.view) ? searchParams.view : DEFAULT_RESEARCH_VIEW,
  );
  const mode = createMemo<RegisterMode>(() =>
    searchParams.mode === "ngsq" ? "ngsq" : "register",
  );

  const index = createMemo(() => buildResearchIndex(props.graph));

  const personId = createMemo(() => {
    const requested =
      typeof searchParams.person === "string" ? searchParams.person : null;
    if (requested && index().peopleById.has(requested)) return requested;
    if (props.graph.viewerPersonId && index().peopleById.has(props.graph.viewerPersonId)) {
      return props.graph.viewerPersonId;
    }
    return [...props.graph.people].sort(sortPeopleByBirth)[0]?.id ?? "";
  });

  const person = createMemo(() => index().peopleById.get(personId()) ?? null);
  const showPicker = createMemo(() =>
    ["sheet", "dossier", "pedigree", "register"].includes(view()),
  );

  const families = createMemo(() => familiesForPerson(index(), personId()));
  const allFamilies = createMemo(() => buildFamilyUnits(index()));
  const dossier = createMemo(() => buildDossier(index(), personId(), locale()));
  const pedigree = createMemo(() => buildPedigree(index(), personId()));
  const register = createMemo(() =>
    buildDescendantRegister(index(), personId(), mode()),
  );
  const surnames = createMemo(() => buildSurnameIndex(index()));
  const places = createMemo(() => buildPlaceIndex(index(), locale()));
  const issues = createMemo(() => buildResearchIssues(index(), locale()));

  const toast = useToast();
  const editable = () =>
    props.graph.role === "owner" || props.graph.role === "editor";

  const [personTarget, setPersonTarget] = createSignal<{
    person: GraphPerson;
    focus?: PersonFormField;
  } | null>(null);
  const [eventTarget, setEventTarget] = createSignal<{
    person: GraphPerson;
    event: GraphPersonEvent | null;
  } | null>(null);
  const [relativeAnchor, setRelativeAnchor] = createSignal<GraphPerson | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = createSignal<{
    person: GraphPerson;
    event: GraphPersonEvent;
  } | null>(null);
  const [deleteEventPending, setDeleteEventPending] = createSignal(false);

  const focusPerson = (nextId: string) => {
    setSearchParams({ person: nextId }, { replace: true });
  };

  const editing: ResearchEditing = {
    editPerson: (targetId, focus) => {
      const target = index().peopleById.get(targetId);
      if (!target) return;
      // Pin a default focus person before a date change reorders the fallback.
      if (targetId === personId()) focusPerson(targetId);
      setPersonTarget({ person: target, focus });
    },
    addEvent: personId => {
      const person = index().peopleById.get(personId);
      if (person) setEventTarget({ person, event: null });
    },
    editEvent: (personId, event) => {
      const person = index().peopleById.get(personId);
      if (person) setEventTarget({ person, event });
    },
    deleteEvent: (personId, event) => {
      const person = index().peopleById.get(personId);
      if (person) setDeleteEventTarget({ person, event });
    },
    addRelative: personId => {
      const person = index().peopleById.get(personId);
      if (person) setRelativeAnchor(person);
    },
  };
  const editAccess = () => (editable() ? editing : undefined);

  /** The other participant of the event being deleted, for a shared warning. */
  const deleteEventPartner = createMemo(() => {
    const target = deleteEventTarget();
    if (!target) return null;
    const otherId = eventPartnerOf(target.event, target.person.id);
    return otherId ? (index().peopleById.get(otherId) ?? null) : null;
  });

  async function handleDeleteEvent() {
    const target = deleteEventTarget();
    if (!target) return;
    setDeleteEventPending(true);
    const result = await attemptAction(() =>
      deletePersonEvent({ treeId: props.treeId, eventId: target.event.id }),
    );
    setDeleteEventPending(false);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    setDeleteEventTarget(null);
    await revalidate(getTreeGraph.key);
    toast.show(t("tree.event.removed"), "success");
  }

  const [printedOn, setPrintedOn] = createSignal("");
  onMount(() => setPrintedOn(formatDate(new Date(), locale())));

  const printPage = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div class="page-shell min-h-[100dvh]">
      <div class="print:hidden">
        <AppHeader
          user={props.user}
          back={{ href: `/trees/${props.treeId}`, label: t("tree.backToTree") }}
          center={props.graph.tree.name}
        />
      </div>

      <main class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6" data-testid="research-page">
        <div class="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <p class="eyebrow mb-2 flex items-center gap-1.5">
              <BookOpen size={13} />
              {t("research.eyebrow")}
            </p>
            <h1 class="font-display text-4xl tracking-tight">{props.graph.tree.name}</h1>
            <ResearchViewIntro view={view()} />
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <Show when={showPicker() && personId()}>
              <PersonPicker
                people={props.graph.people}
                personId={personId()}
                onChange={next => setSearchParams({ person: next }, { replace: true })}
              />
            </Show>
            <Button
              type="button"
              variant="secondary"
              onClick={printPage}
              data-testid="research-print"
            >
              <Printer size={15} />
              {t("research.print")}
            </Button>
            <A
              href={`/trees/${props.treeId}`}
              class={buttonVariants({ variant: "secondary", size: "sm" })}
              data-testid="research-open-graph"
            >
              <Network size={15} />
              {t("tree.openGraph")}
            </A>
          </div>
        </div>

        <div class="mt-4 print:hidden">
          <ResearchNav treeId={props.treeId} view={view()} personId={personId() || null} />
        </div>

        <div class="hidden print:mb-4 print:block">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">
            {t("research.print.header", {
              view: t(researchViewLabelKey(view())),
              tree: props.graph.tree.name,
            })}
            <Show when={printedOn()}>
              {" · "}
              {t("research.print.printed", { date: printedOn() })}
            </Show>
          </p>
          <Show when={person()}>
            {selected => (
              <h1 class="font-display text-2xl tracking-tight">{personName(selected(), locale())}</h1>
            )}
          </Show>
        </div>

        <Show
          when={props.graph.people.length}
          fallback={
            <div
              class="mt-8 rounded-3xl border border-dashed border-border p-10 text-center"
              data-testid="research-empty-tree"
            >
              <Search class="mx-auto text-muted-foreground" />
              <p class="mt-3 text-sm font-medium">{t("research.empty.title")}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {t("research.empty.body")}
              </p>
              <A
                href={`/trees/${props.treeId}`}
                class={buttonVariants({ variant: "secondary", size: "sm", class: "mt-4" })}
                data-testid="research-empty-open-graph"
              >
                {t("research.empty.open")}
              </A>
            </div>
          }
        >
          <div class="mt-5">
            <Switch>
              <Match when={view() === "sheet"}>
                <Show
                  when={person() && families().length}
                  fallback={<MissingPerson />}
                >
                  <FamilyGroupSheet
                    treeId={props.treeId}
                    index={index()}
                    families={families()}
                    personId={personId()}
                    editing={editAccess()}
                  />
                  <Show when={allFamilies().length > 1}>
                    <p class="mt-3 text-xs text-muted-foreground">
                      {t("research.sheet.more", { count: allFamilies().length })}
                    </p>
                  </Show>
                </Show>
              </Match>

              <Match when={view() === "dossier"}>
                <Show when={dossier()} fallback={<MissingPerson />}>
                  {data => (
                    <DossierView
                      treeId={props.treeId}
                      index={index()}
                      dossier={data()}
                      viewerPersonId={props.graph.viewerPersonId}
                      editing={editAccess()}
                    />
                  )}
                </Show>
              </Match>

              <Match when={view() === "pedigree"}>
                <Show when={pedigree()} fallback={<MissingPerson />}>
                  {chart => <PedigreeOutline treeId={props.treeId} pedigree={chart()} />}
                </Show>
              </Match>

              <Match when={view() === "register"}>
                <Show when={register()} fallback={<MissingPerson />}>
                  {list => (
                    <DescendantRegisterView
                      treeId={props.treeId}
                      register={list()}
                      mode={mode()}
                      onModeChange={next =>
                        setSearchParams({ mode: next }, { replace: true })
                      }
                    />
                  )}
                </Show>
              </Match>

              <Match when={view() === "surnames"}>
                <SurnameIndexView treeId={props.treeId} groups={surnames()} />
              </Match>

              <Match when={view() === "places"}>
                <PlaceIndexView treeId={props.treeId} index={places()} />
              </Match>

              <Match when={view() === "issues"}>
                <ResearchIssuesView
                  treeId={props.treeId}
                  issues={issues()}
                  index={index()}
                  editing={editAccess()}
                />
              </Match>
            </Switch>
          </div>
        </Show>
      </main>

      <Show when={personTarget()}>
        {target => (
          <PersonFormDialog
            open
            onClose={() => setPersonTarget(null)}
            treeId={props.treeId}
            person={target().person}
            focusField={target().focus}
          />
        )}
      </Show>

      <Show when={eventTarget()}>
        {target => (
          <PersonEventDialog
            open
            onClose={() => setEventTarget(null)}
            treeId={props.treeId}
            person={target().person}
            people={props.graph.people}
            relationships={props.graph.relationships}
            event={target().event}
          />
        )}
      </Show>

      <Show when={relativeAnchor()}>
        {anchor => (
          <AddRelativeDialog
            open
            onClose={() => setRelativeAnchor(null)}
            treeId={props.treeId}
            anchor={anchor()}
            people={props.graph.people}
            relationships={props.graph.relationships}
            anchorParentCount={index().parents.get(anchor().id)?.length ?? 0}
            onAdded={focusPerson}
          />
        )}
      </Show>

      <ConfirmDialog
        open={Boolean(deleteEventTarget())}
        onClose={() => setDeleteEventTarget(null)}
        title={t("tree.delete.title", {
          name: deleteEventTarget()?.event.title ?? t("tree.delete.eventName"),
        })}
        message={
          deleteEventPartner()
            ? t("tree.delete.eventSharedMessage", {
                name: deleteEventPartner()!.displayName,
              })
            : t("tree.delete.eventMessage")
        }
        confirmLabel={t("tree.delete.eventConfirm")}
        danger
        pending={deleteEventPending()}
        testId="research-confirm-delete-event"
        onConfirm={handleDeleteEvent}
      />
    </div>
  );
}

function MissingPerson() {
  const { t } = useI18n();
  return (
    <div
      class="rounded-3xl border border-dashed border-border p-10 text-center"
      data-testid="research-missing-person"
    >
      <p class="text-sm font-medium">{t("research.missingPerson.title")}</p>
      <p class="mt-1 text-xs text-muted-foreground">
        {t("research.missingPerson.body")}
      </p>
    </div>
  );
}
