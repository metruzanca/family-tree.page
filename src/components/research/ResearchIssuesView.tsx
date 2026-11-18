import { For, Show, createMemo } from "solid-js";
import { TriangleAlert } from "lucide-solid";
import {
  ISSUE_CATEGORY_KEYS,
  type ResearchIssue,
  type ResearchIssueCategory,
} from "~/lib/research/issues";
import { personName, type ResearchIndex } from "~/lib/research/graph";
import { useI18n } from "~/i18n/LocaleProvider";
import { researchHref } from "./views";
import { Badge } from "../ui/badge";

const CATEGORY_ORDER: ResearchIssueCategory[] = [
  "dates",
  "relationships",
  "records",
  "duplicates",
];

export function ResearchIssuesView(props: {
  treeId: string;
  issues: ResearchIssue[];
  index: ResearchIndex;
}) {
  const { t } = useI18n();
  const warnings = createMemo(
    () => props.issues.filter(issue => issue.severity === "warning").length,
  );
  const info = createMemo(
    () => props.issues.filter(issue => issue.severity === "info").length,
  );

  return (
    <div class="space-y-5">
      <div class="grid gap-2 sm:grid-cols-2">
        <Stat label={t("tree.import.stats.warnings")} value={warnings()} tone="warning" />
        <Stat label={t("research.issues.gaps")} value={info()} tone="info" />
      </div>

      <Show
        when={props.issues.length}
        fallback={
          <div
            class="rounded-3xl border border-dashed border-border p-10 text-center"
            data-testid="research-issues-empty"
          >
            <TriangleAlert class="mx-auto text-muted-foreground" />
            <p class="mt-3 text-sm font-medium">{t("research.issues.emptyTitle")}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              {t("research.issues.emptyBody")}
            </p>
          </div>
        }
      >
        <div class="space-y-5" data-testid="research-issues-list">
          <For each={CATEGORY_ORDER}>
            {category => {
              const rows = createMemo(() =>
                props.issues.filter(issue => issue.category === category),
              );
              return (
                <Show when={rows().length}>
                  <section data-testid={`research-issues-${category}`}>
                    <h2 class="mb-2 text-sm font-semibold">
                      {t(ISSUE_CATEGORY_KEYS[category])}
                      <span class="ml-2 text-xs font-normal text-muted-foreground">
                        {rows().length}
                      </span>
                    </h2>
                    <div class="space-y-2">
                      <For each={rows()}>
                        {issue => (
                          <IssueCard
                            issue={issue}
                            treeId={props.treeId}
                            index={props.index}
                          />
                        )}
                      </For>
                    </div>
                  </section>
                </Show>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function IssueCard(props: {
  issue: ResearchIssue;
  treeId: string;
  index: ResearchIndex;
}) {
  const { t } = useI18n();
  const people = createMemo(() =>
    props.issue.personIds
      .map(id => props.index.peopleById.get(id))
      .filter((person): person is NonNullable<typeof person> => Boolean(person)),
  );
  const visible = createMemo(() => people().slice(0, 8));

  return (
    <article
      class="rounded-2xl border border-border bg-card p-4"
      data-testid={`research-issue-${props.issue.id}`}
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h3 class="text-sm font-semibold">
          {t(props.issue.titleKey, props.issue.titleParams)}
        </h3>
        <Badge
          variant={props.issue.severity === "warning" ? "destructive" : "secondary"}
        >
          {props.issue.severity === "warning"
            ? t("research.issues.warning")
            : t("research.issues.gap")}
        </Badge>
      </div>
      <Show when={props.issue.detail}>
        <p class="mt-1 text-sm text-muted-foreground">
          {t(props.issue.detailKey, props.issue.detailParams)}
        </p>
      </Show>
      <Show when={visible().length}>
        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <For each={visible()}>
            {person => (
              <a
                href={researchHref(props.treeId, "dossier", person.id)}
                class="text-xs font-medium text-primary underline-offset-2 hover:underline"
                data-testid={`research-issue-person-${props.issue.id}-${person.id}`}
              >
                {personName(person)}
              </a>
            )}
          </For>
          <Show when={people().length > visible().length}>
            <span class="text-xs text-muted-foreground">
              {t("common.moreCount", { count: people().length - visible().length })}
            </span>
          </Show>
        </div>
      </Show>
    </article>
  );
}

function Stat(props: {
  label: string;
  value: number;
  tone: "warning" | "info";
}) {
  return (
    <div class="rounded-2xl border border-border bg-card px-4 py-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p
        class="mt-0.5 font-display text-2xl tracking-tight"
        classList={{ "text-destructive": props.tone === "warning" && props.value > 0 }}
      >
        {props.value}
      </p>
    </div>
  );
}
