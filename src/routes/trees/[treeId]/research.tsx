import { Match, Show, Suspense, Switch, createMemo, createSignal, onMount } from "solid-js";
import { A, createAsync, useParams, useSearchParams } from "@solidjs/router";
import { BookOpen, Network, Printer, Search } from "lucide-solid";
import type { TreeGraph } from "~/api/people-server";
import type { PublicUser } from "~/server/auth-service";
import { getTreeGraph, requireUserPage } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { LoadingScreen } from "~/components/ui/Loading";
import { Button, buttonVariants } from "~/components/ui/button";
import { DossierView } from "~/components/research/DossierView";
import { DescendantRegisterView } from "~/components/research/DescendantRegisterView";
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
  researchViewLabel,
  type ResearchView,
} from "~/components/research/views";
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
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppErrorBoundary
        title="We could not load the research desk"
        message="The tree may be temporarily unavailable. Try again in a moment."
        revalidateKeys={[requireUserPage.key, getTreeGraph.key]}
        back={{ href: "/trees", label: "Back to your trees" }}
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
  const dossier = createMemo(() => buildDossier(index(), personId()));
  const pedigree = createMemo(() => buildPedigree(index(), personId()));
  const register = createMemo(() =>
    buildDescendantRegister(index(), personId(), mode()),
  );
  const surnames = createMemo(() => buildSurnameIndex(index()));
  const places = createMemo(() => buildPlaceIndex(index()));
  const issues = createMemo(() => buildResearchIssues(index()));

  const [printedOn, setPrintedOn] = createSignal("");
  onMount(() => setPrintedOn(new Date().toLocaleDateString()));

  const printPage = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div class="page-shell min-h-[100dvh]">
      <div class="print:hidden">
        <AppHeader
          user={props.user}
          back={{ href: `/trees/${props.treeId}`, label: "Back to tree" }}
          center={props.graph.tree.name}
        />
      </div>

      <main class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6" data-testid="research-page">
        <div class="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div>
            <p class="eyebrow mb-2 flex items-center gap-1.5">
              <BookOpen size={13} />
              Research desk
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
              Print
            </Button>
            <A
              href={`/trees/${props.treeId}`}
              class={buttonVariants({ variant: "secondary", size: "sm" })}
              data-testid="research-open-graph"
            >
              <Network size={15} />
              Open graph
            </A>
          </div>
        </div>

        <div class="mt-4 print:hidden">
          <ResearchNav treeId={props.treeId} view={view()} personId={personId() || null} />
        </div>

        <div class="hidden print:mb-4 print:block">
          <p class="text-xs uppercase tracking-wide text-muted-foreground">
            {researchViewLabel(view())} · {props.graph.tree.name}
            <Show when={printedOn()}> · printed {printedOn()}</Show>
          </p>
          <Show when={person()}>
            {selected => (
              <h1 class="font-display text-2xl tracking-tight">{personName(selected())}</h1>
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
              <p class="mt-3 text-sm font-medium">This tree has no people yet</p>
              <p class="mt-1 text-xs text-muted-foreground">
                Add a person on the graph and the research views will fill in.
              </p>
              <A
                href={`/trees/${props.treeId}`}
                class={buttonVariants({ variant: "secondary", size: "sm", class: "mt-4" })}
                data-testid="research-empty-open-graph"
              >
                Open the graph
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
                  />
                  <Show when={allFamilies().length > 1}>
                    <p class="mt-3 text-xs text-muted-foreground">
                      {allFamilies().length} family sheets in this tree. Change the
                      focus person to open another one.
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
                />
              </Match>
            </Switch>
          </div>
        </Show>
      </main>
    </div>
  );
}

function MissingPerson() {
  return (
    <div
      class="rounded-3xl border border-dashed border-border p-10 text-center"
      data-testid="research-missing-person"
    >
      <p class="text-sm font-medium">Choose a person to begin</p>
      <p class="mt-1 text-xs text-muted-foreground">
        This view is built from one person and their immediate family.
      </p>
    </div>
  );
}
