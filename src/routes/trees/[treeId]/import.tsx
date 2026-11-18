import { For, Show, Suspense, createMemo, createSignal } from "solid-js";
import { A, createAsync, useNavigate, useParams } from "@solidjs/router";
import { ArrowLeft, FileUp, TriangleAlert } from "lucide-solid";
import type { GraphPerson } from "~/api/people-server";
import { getTreeGraph, requireUserPage } from "~/api";
import { applyGedcomImport } from "~/api/gedcom-import-server";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { LoadingScreen } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { formatFuzzyYearRange } from "~/lib/fuzzy-date";
import {
  parseGedcom,
  MAX_GEDCOM_CHARS,
  type GedcomImportResult,
  type GedcomImportedPerson,
} from "~/lib/gedcom-import";
import {
  defaultImportDecision,
  suggestGedcomMatches,
  type GedcomMatchSuggestion,
} from "~/lib/gedcom-match";
import {
  planImport,
  type ImportDecision,
} from "~/lib/gedcom-plan";
import { personSexLabel } from "~/lib/person-sex";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
  },
};

export default function TreeImportPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppErrorBoundary
        title="We could not load the import page"
        message="The tree may be temporarily unavailable. Try again in a moment."
        revalidateKeys={[requireUserPage.key, getTreeGraph.key]}
        back={{ href: "/trees", label: "Back to your trees" }}
      >
        <TreeImportInner />
      </AppErrorBoundary>
    </Suspense>
  );
}

function TreeImportInner() {
  const params = useParams<{ treeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const user = createAsync(() => requireUserPage());
  const graph = createAsync(() => getTreeGraph(params.treeId));

  const [fileName, setFileName] = createSignal("");
  const [text, setText] = createSignal("");
  const [parsed, setParsed] = createSignal<GedcomImportResult | null>(null);
  const [decisions, setDecisions] = createSignal<
    Record<string, ImportDecision>
  >({});
  const [error, setError] = createSignal("");
  const [reading, setReading] = createSignal(false);
  const [applying, setApplying] = createSignal(false);

  const suggestions = createMemo<Map<string, GedcomMatchSuggestion>>(() => {
    const result = parsed();
    const data = graph();
    if (!result || !data) return new Map();
    return suggestGedcomMatches(
      result,
      data.people.map(person => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        maidenName: person.maidenName,
        nickname: person.nickname,
        displayName: person.displayName,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        sex: person.sex,
      })),
    );
  });

  const sortedPeople = createMemo(() =>
    [...(graph()?.people ?? [])].sort((left, right) => {
      const a = renderName(left);
      const b = renderName(right);
      return a.localeCompare(b);
    }),
  );

  const plan = createMemo(() => {
    const result = parsed();
    const data = graph();
    if (!result || !data) return null;
    return planImport({
      parsed: result,
      existingPeople: data.people.map(person => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        maidenName: person.maidenName,
        nickname: person.nickname,
        sex: person.sex,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        birthPlace: person.birthPlace,
        deathPlace: person.deathPlace,
        bio: person.bio,
      })),
      existingEvents: data.events.map(event => ({
        personId: event.personId,
        kind: event.kind,
        title: event.title,
        place: event.place,
        description: event.description,
        date: event.date,
      })),
      decisions: Object.values(decisions()),
    });
  });

  const canEdit = createMemo(
    () => graph()?.role === "owner" || graph()?.role === "editor",
  );

  async function chooseFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError("");
    setParsed(null);
    setText("");
    setDecisions({});
    setFileName(file.name);
    if (file.size > MAX_GEDCOM_CHARS) {
      setError("That file is larger than 5 MB.");
      return;
    }
    setReading(true);
    try {
      const content = await file.text();
      const result = parseGedcom(content);
      const matches = suggestGedcomMatches(
        result,
        (graph()?.people ?? []).map(person => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          maidenName: person.maidenName,
          nickname: person.nickname,
          displayName: person.displayName,
          birthDate: person.birthDate,
          deathDate: person.deathDate,
          sex: person.sex,
        })),
      );
      const initial: Record<string, ImportDecision> = {};
      for (const person of result.people) {
        const suggestion = matches.get(person.xref);
        initial[person.xref] = {
          xref: person.xref,
          ...(suggestion
            ? defaultImportDecision(suggestion)
            : { action: "create" as const, personId: null }),
        };
      }
      setText(content);
      setParsed(result);
      setDecisions(initial);
      if (!result.people.length) {
        setError("No people were found in that file.");
      }
    } catch {
      setError("That file could not be read as text.");
    } finally {
      setReading(false);
    }
  }

  function setDecision(xref: string, patch: Partial<ImportDecision>) {
    setDecisions(current => {
      const existing = current[xref];
      if (!existing) return current;
      return { ...current, [xref]: { ...existing, ...patch } };
    });
  }

  async function apply() {
    const current = plan();
    if (!parsed() || !current || current.errors.length || applying()) return;
    if (!current.counts.create && !current.counts.merge) {
      setError("Choose at least one person to add or merge.");
      return;
    }
    setApplying(true);
    setError("");
    const result = await attemptAction(() =>
      applyGedcomImport({
        treeId: params.treeId,
        fileName: fileName() || null,
        text: text(),
        decisions: Object.values(decisions()),
      }),
    );
    setApplying(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(
      `Import finished: ${result.data.created} added, ${result.data.merged} merged.`,
      "success",
    );
    navigate(`/trees/${params.treeId}`);
  }

  return (
    <Show when={user()}>
      {currentUser => (
        <Show when={graph()} fallback={<LoadingScreen />}>
          {data => (
            <div class="page-shell min-h-[100dvh]" data-testid="import-page">
              <AppHeader
                user={currentUser()}
                back={{ href: `/trees/${params.treeId}`, label: "Back to tree" }}
                center={data().tree.name}
              />
              <main class="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6">
                <div class="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p class="eyebrow mb-2 flex items-center gap-1.5">
                      <FileUp size={13} />
                      Import GEDCOM
                    </p>
                    <h1 class="font-display text-4xl tracking-tight">
                      Add to {data().tree.name}
                    </h1>
                    <p class="mt-2 max-w-2xl text-sm text-muted-foreground">
                      Review every person before anything is written. New people
                      are added, merged people only have empty fields filled, and
                      existing relationships and identical events are left alone.
                    </p>
                  </div>
                  <A
                    href={`/trees/${params.treeId}`}
                    class={buttonVariants({ variant: "secondary", size: "sm" })}
                    data-testid="import-open-graph"
                  >
                    <ArrowLeft size={15} />
                    Back to graph
                  </A>
                </div>

                <Show
                  when={canEdit()}
                  fallback={
                    <div class="mt-8 rounded-3xl border border-dashed border-border p-10 text-center">
                      <TriangleAlert class="mx-auto text-muted-foreground" />
                      <p class="mt-3 text-sm font-medium">
                        Only editors and owners can import
                      </p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        Ask a tree editor to merge this file, or download the tree
                        as GEDCOM instead.
                      </p>
                    </div>
                  }
                >
                  <section class="mt-6 rounded-3xl border border-border bg-card p-5 shadow-card">
                    <label class="block text-sm font-semibold" for="import-file">
                      GEDCOM file
                      <input
                        id="import-file"
                        type="file"
                        accept=".ged,.txt,text/plain"
                        class="input mt-2 file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                        onChange={chooseFile}
                        data-testid="import-file"
                      />
                    </label>
                    <p class="mt-2 text-xs text-muted-foreground">
                      Up to 5 MB. {fileName() ? `Selected ${fileName()}.` : "No file selected."}
                      <Show when={reading()}> Reading…</Show>
                    </p>
                    <Show when={error()}>
                      <p class="mt-3 text-sm text-destructive" data-testid="import-error">
                        {error()}
                      </p>
                    </Show>
                  </section>

                  <Show when={parsed()}>
                    {result => (
                      <>
                        <section
                          class="mt-5 rounded-3xl border border-border bg-card p-5 shadow-card"
                          data-testid="import-summary"
                        >
                          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <Stat label="New" value={plan()?.counts.create ?? 0} />
                            <Stat label="Merge" value={plan()?.counts.merge ?? 0} />
                            <Stat label="Skip" value={plan()?.counts.skip ?? 0} />
                            <Stat label="Links" value={plan()?.counts.parentLinks ?? 0} />
                            <Stat label="Events" value={plan()?.counts.events ?? 0} />
                          </div>
                          <p class="mt-2 text-xs text-muted-foreground">
                            Existing people, links, and identical events are kept.
                            Links counts the parent links in the file; only missing
                            ones are added.
                          </p>
                          <Show when={result().stats.warnings}>
                            <p class="mt-3 text-xs text-muted-foreground">
                              {result().stats.warnings} file{" "}
                              {result().stats.warnings === 1 ? "warning" : "warnings"}.
                              The review below shows the records that were read.
                            </p>
                          </Show>
                          <Show when={plan()?.errors.length}>
                            <ul class="mt-3 space-y-1" data-testid="import-plan-errors">
                              <For each={plan()!.errors}>
                                {message => (
                                  <li class="text-sm text-destructive">{message}</li>
                                )}
                              </For>
                            </ul>
                          </Show>
                        </section>

                        <section class="mt-5 space-y-2" data-testid="import-review">
                          <For each={result().people}>
                            {person => (
                              <ReviewRow
                                person={person}
                                decision={decisions()[person.xref]}
                                suggestion={suggestions().get(person.xref)}
                                people={sortedPeople()}
                                onDecision={patch => setDecision(person.xref, patch)}
                              />
                            )}
                          </For>
                        </section>

                        <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4">
                          <p class="text-sm text-muted-foreground">
                            {plan()?.counts.create ?? 0} new,{" "}
                            {plan()?.counts.merge ?? 0} merged,{" "}
                            {plan()?.counts.skip ?? 0} skipped.
                            <Show when={(plan()?.counts.eventsSkipped ?? 0) > 0}>
                              {" "}
                              {plan()!.counts.eventsSkipped} identical events skipped.
                            </Show>
                          </p>
                          <Button
                            type="button"
                            onClick={apply}
                            disabled={
                              applying() ||
                              !plan() ||
                              plan()!.errors.length > 0 ||
                              (!plan()!.counts.create && !plan()!.counts.merge)
                            }
                            data-testid="import-apply"
                          >
                            {applying() ? "Applying…" : "Apply import"}
                          </Button>
                        </div>
                      </>
                    )}
                  </Show>
                </Show>
              </main>
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}

function ReviewRow(props: {
  person: GedcomImportedPerson;
  decision: ImportDecision | undefined;
  suggestion: GedcomMatchSuggestion | undefined;
  people: GraphPerson[];
  onDecision: (patch: Partial<ImportDecision>) => void;
}) {
  const action = () => props.decision?.action ?? "create";
  return (
    <div
      class="rounded-2xl border border-border bg-card p-4"
      data-testid={`import-row-${props.person.xref}`}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium">
            {props.person.firstName} {props.person.lastName}
          </p>
          <p class="text-xs text-muted-foreground">
            {formatFuzzyYearRange(props.person.birthDate, props.person.deathDate) ||
              "No dates"}
            {" · "}
            {personSexLabel(props.person.sex)}
          </p>
          <Show when={props.suggestion?.personId}>
            <p class="mt-1 text-xs text-muted-foreground">
              Possible match: {props.suggestion!.displayName}
              <Show when={props.suggestion!.reasons.length}>
                {" · "}
                {props.suggestion!.reasons.join(", ")}
              </Show>
            </p>
          </Show>
        </div>
        <div class="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={action() === "create" ? "default" : "ghost"}
            onClick={() => props.onDecision({ action: "create", personId: null })}
            data-testid={`import-create-${props.person.xref}`}
          >
            Create
          </Button>
          <Button
            type="button"
            size="sm"
            variant={action() === "merge" ? "default" : "ghost"}
            onClick={() =>
              props.onDecision({
                action: "merge",
                personId:
                  props.decision?.personId ?? props.suggestion?.personId ?? "",
              })
            }
            data-testid={`import-merge-${props.person.xref}`}
          >
            Merge
          </Button>
          <Button
            type="button"
            size="sm"
            variant={action() === "skip" ? "default" : "ghost"}
            onClick={() => props.onDecision({ action: "skip", personId: null })}
            data-testid={`import-skip-${props.person.xref}`}
          >
            Skip
          </Button>
        </div>
      </div>

      <Show when={action() === "merge"}>
        <label class="mt-3 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Merge into
          <select
            class="input text-sm normal-case tracking-normal"
            value={props.decision?.personId ?? ""}
            onChange={event =>
              props.onDecision({
                action: "merge",
                personId: event.currentTarget.value,
              })
            }
            data-testid={`import-target-${props.person.xref}`}
          >
            <option value="">Choose a person</option>
            <For each={props.people}>
              {person => (
                <option value={person.id}>
                  {renderName(person)}
                  {parseYears(person)}
                </option>
              )}
            </For>
          </select>
        </label>
      </Show>
    </div>
  );
}

function renderName(person: GraphPerson) {
  return person.displayName || `${person.firstName} ${person.lastName}`.trim();
}

function parseYears(person: GraphPerson) {
  const range = formatFuzzyYearRange(person.birthDate, person.deathDate);
  return range ? ` (${range})` : "";
}

function Stat(props: { label: string; value: number }) {
  return (
    <div class="rounded-xl border border-border bg-muted/40 px-2.5 py-2">
      <p class="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p class="font-display text-xl leading-tight">{props.value}</p>
    </div>
  );
}
