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
import { useI18n } from "~/i18n/LocaleProvider";
import type { Locale, TranslationKey } from "~/i18n";
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

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
  },
};

export default function TreeImportPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AppErrorBoundary
        title={t("tree.import.into.errorTitle")}
        message={t("tree.error.unavailable")}
        revalidateKeys={[requireUserPage.key, getTreeGraph.key]}
        back={{ href: "/trees", label: t("tree.error.backToTrees") }}
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
  const { t, locale } = useI18n();
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
      setError(t("tree.import.errorTooLarge"));
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
        setError(t("tree.import.into.noPeople"));
      }
    } catch {
      setError(t("tree.import.errorUnreadable"));
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
      setError(t("tree.import.into.errorNothingSelected"));
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
      t("tree.import.into.finished", {
        created: result.data.created,
        merged: result.data.merged,
      }),
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
                back={{ href: `/trees/${params.treeId}`, label: t("tree.backToTree") }}
                center={data().tree.name}
              />
              <main class="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6">
                <div class="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p class="eyebrow mb-2 flex items-center gap-1.5">
                      <FileUp size={13} />
                      {t("tree.import.into.eyebrow")}
                    </p>
                    <h1 class="font-display text-4xl tracking-tight">
                      {t("tree.import.into.heading", { tree: data().tree.name })}
                    </h1>
                    <p class="mt-2 max-w-2xl text-sm text-muted-foreground">
                      {t("tree.import.into.description")}
                    </p>
                  </div>
                  <A
                    href={`/trees/${params.treeId}`}
                    class={buttonVariants({ variant: "secondary", size: "sm" })}
                    data-testid="import-open-graph"
                  >
                    <ArrowLeft size={15} />
                    {t("tree.import.into.backToGraph")}
                  </A>
                </div>

                <Show
                  when={canEdit()}
                  fallback={
                    <div class="mt-8 rounded-3xl border border-dashed border-border p-10 text-center">
                      <TriangleAlert class="mx-auto text-muted-foreground" />
                      <p class="mt-3 text-sm font-medium">
                        {t("tree.import.into.editorsOnlyTitle")}
                      </p>
                      <p class="mt-1 text-xs text-muted-foreground">
                        {t("tree.import.into.editorsOnlyBody")}
                      </p>
                    </div>
                  }
                >
                  <section class="mt-6 rounded-3xl border border-border bg-card p-5 shadow-card">
                    <label class="block text-sm font-semibold" for="import-file">
                      {t("tree.import.fileLabel")}
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
                      {t("tree.import.into.fileHint")}{" "}
                      {fileName()
                        ? t("tree.import.into.selectedFile", { name: fileName() })
                        : t("tree.import.into.noFile")}
                      <Show when={reading()}> {t("tree.import.reading")}</Show>
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
                            <Stat label={t("tree.import.into.stat.new")} value={plan()?.counts.create ?? 0} />
                            <Stat label={t("tree.import.into.stat.merge")} value={plan()?.counts.merge ?? 0} />
                            <Stat label={t("tree.import.into.stat.skip")} value={plan()?.counts.skip ?? 0} />
                            <Stat label={t("tree.import.into.stat.links")} value={plan()?.counts.parentLinks ?? 0} />
                            <Stat label={t("tree.import.stats.events")} value={plan()?.counts.events ?? 0} />
                          </div>
                          <p class="mt-2 text-xs text-muted-foreground">
                            {t("tree.import.into.summaryNote")}
                          </p>
                          <Show when={result().stats.warnings}>
                            <p class="mt-3 text-xs text-muted-foreground">
                              {t("tree.import.into.warnings", {
                                count: result().stats.warnings,
                              })}
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
                            {t("tree.import.into.footer", {
                              created: plan()?.counts.create ?? 0,
                              merged: plan()?.counts.merge ?? 0,
                              skipped: plan()?.counts.skip ?? 0,
                            })}
                            <Show when={(plan()?.counts.eventsSkipped ?? 0) > 0}>
                              {" "}
                              {t("tree.import.into.eventsSkipped", {
                                count: plan()!.counts.eventsSkipped,
                              })}
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
                            {applying()
                              ? t("tree.import.into.applying")
                              : t("tree.import.into.apply")}
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
  const { t, locale } = useI18n();
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
            {formatFuzzyYearRange(
              props.person.birthDate,
              props.person.deathDate,
              locale(),
            ) || t("tree.import.into.noDates")}
            {" · "}
            {t(sexKey(props.person.sex))}
          </p>
          <Show when={props.suggestion?.personId}>
            <p class="mt-1 text-xs text-muted-foreground">
              {t("tree.import.into.possibleMatch", {
                name: props.suggestion!.displayName ?? "",
              })}
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
            {t("tree.import.into.create")}
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
            {t("tree.import.into.merge")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={action() === "skip" ? "default" : "ghost"}
            onClick={() => props.onDecision({ action: "skip", personId: null })}
            data-testid={`import-skip-${props.person.xref}`}
          >
            {t("tree.import.into.skip")}
          </Button>
        </div>
      </div>

      <Show when={action() === "merge"}>
        <label class="mt-3 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tree.import.into.mergeInto")}
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
            <option value="">{t("tree.import.into.choosePerson")}</option>
            <For each={props.people}>
              {person => (
                <option value={person.id}>
                  {renderName(person)}
                  {parseYears(person, locale())}
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

function sexKey(sex: GraphPerson["sex"]): TranslationKey {
  return sex === "female"
    ? "person.sex.female"
    : sex === "male"
      ? "person.sex.male"
      : sex === "other"
        ? "person.sex.other"
        : "common.unknown";
}

function parseYears(person: GraphPerson, locale: Locale) {
  const range = formatFuzzyYearRange(person.birthDate, person.deathDate, locale);
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
