import { A, createAsync, revalidate } from "@solidjs/router";
import { For, Show, createSignal, onMount } from "solid-js";
import { ArrowUpRight, CalendarDays, Plus, RotateCcw, Sprout, Trash2, Upload, Users } from "lucide-solid";
import { getMyTrees, getPendingDeletionTrees, requireUserPage } from "~/api";
import { restoreTree } from "~/api/trees-server";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { AppHeader } from "~/components/app/AppHeader";
import { VerifyEmailNotice } from "~/components/auth/VerifyEmailNotice";
import { CreateTreeDialog } from "~/components/trees/CreateTreeDialog";
import { ImportGedcomDialog } from "~/components/trees/ImportGedcomDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { LoadingCards } from "~/components/ui/Loading";
import { useToast } from "~/components/ui/Toast";
import { attemptAction } from "~/lib/action-result";
import { track } from "~/lib/analytics";
import { formatDate, formatRelative, roleKey } from "~/lib/format";
import { daysUntilPurge } from "~/lib/tree-deletion";
import { useI18n } from "~/i18n/LocaleProvider";

export const route = {
  preload: () => {
    requireUserPage();
    getMyTrees();
    getPendingDeletionTrees();
  },
};

export default function TreesPage() {
  const { t } = useI18n();
  return (
    <AppErrorBoundary
      title={t("trees.error.title")}
      message={t("trees.error.message")}
      revalidateKeys={[requireUserPage.key, getMyTrees.key, getPendingDeletionTrees.key]}
      back={{ href: "/", label: t("error.goHome") }}
    >
      <TreesInner />
    </AppErrorBoundary>
  );
}

function TreesInner() {
  const { t, locale } = useI18n();
  const user = createAsync(() => requireUserPage());
  const trees = createAsync(() => getMyTrees());
  const pending = createAsync(() => getPendingDeletionTrees());
  const toast = useToast();
  const [creating, setCreating] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [restoringId, setRestoringId] = createSignal<string | null>(null);

  // Tree lists change from other sessions and from the deletion flow, so a
  // visit always asks for the current state instead of trusting a cached list.
  onMount(() => {
    void revalidate([getMyTrees.key, getPendingDeletionTrees.key]);
  });

  async function restore(treeId: string, name: string) {
    if (restoringId()) return;
    setRestoringId(treeId);
    const result = await attemptAction(() => restoreTree(treeId));
    setRestoringId(null);
    if (!result.ok) {
      toast.show(result.error, "error");
      return;
    }
    await revalidate([getMyTrees.key, getPendingDeletionTrees.key]);
    track("tree_restored");
    toast.show(t("trees.restored", { name }), "success");
  }

  return (
    <div class="page-shell min-h-[100dvh]">
      <Show when={user()}>
        {currentUser => (
          <>
            <AppHeader
              user={currentUser()}
              actions={
                <div class="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setImporting(true)}
                    data-testid="trees-import-gedcom"
                  >
                    <Upload />
                    {t("trees.import")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCreating(true)}
                    data-testid="trees-new-tree"
                  >
                    <Plus />
                    {t("trees.newTree")}
                  </Button>
                </div>
              }
            />
            <main class="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6">
              <Show when={!currentUser().emailVerified}>
                <VerifyEmailNotice email={currentUser().email} class="mb-8" />
              </Show>
              <section class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="eyebrow mb-2">{t("trees.eyebrow")}</p>
                  <h1 class="font-display text-4xl tracking-tight sm:text-5xl">
                    {t("trees.title")}
                  </h1>
                  <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {t("trees.subtitle")}
                  </p>
                </div>
                <div class="hidden items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm shadow-xs sm:flex">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Sprout size={17} />
                  </span>
                  <div>
                    <p class="font-semibold leading-tight">{currentUser().displayName}</p>
                    <p class="text-xs text-muted-foreground">
                      {t("trees.count", { count: trees()?.length ?? 0 })}
                    </p>
                  </div>
                </div>
              </section>

              <Show when={pending() && pending()!.length > 0}>
                <section class="mt-10" data-testid="deleted-trees-section">
                  <div class="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 class="font-display text-2xl tracking-tight">{t("trees.deleted.title")}</h2>
                      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {t("trees.deleted.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={pending()}>
                      {tree => {
                        const days = () => daysUntilPurge(tree.purgeAfter);
                        const erasedText = () => {
                          if (!tree.purgeAfter) return t("trees.deleted.erasedOverdue");
                          const date = formatDate(tree.purgeAfter, locale());
                          if (days() === 0) return t("trees.deleted.erasedNextRun", { date });
                          if (days() === 1) return t("trees.deleted.erasedTomorrow", { date });
                          return t("trees.deleted.erasedInDays", { date, days: days() });
                        };
                        return (
                          <Card
                            class="flex h-full flex-col gap-0 border-destructive/30 bg-destructive/5 p-4"
                            data-testid={`deleted-tree-card-${tree.id}`}
                          >
                            <div class="flex items-start gap-3">
                              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
                                <Trash2 size={18} />
                              </span>
                              <div class="min-w-0">
                                <h3 class="truncate font-display text-lg leading-tight tracking-tight">
                                  {tree.name}
                                </h3>
                                <p class="mt-0.5 text-xs text-muted-foreground">
                                  {t("common.person", { count: tree.peopleCount })} ·{" "}
                                  {t("trees.member", { count: tree.memberCount })}
                                </p>
                              </div>
                            </div>
                            <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                              {t("trees.deleted.requestedBy", {
                                name: tree.requestedByName,
                                when: formatRelative(tree.deletedAt, locale()),
                              })}{" "}
                              {erasedText()}
                            </p>
                            <div class="mt-4 flex flex-wrap items-center gap-2">
                              <Show
                                when={tree.role === "owner"}
                                fallback={
                                  <p class="text-xs leading-relaxed text-muted-foreground">
                                    {t("trees.deleted.ownerOnly")}
                                  </p>
                                }
                              >
                                <Button
                                  size="sm"
                                  type="button"
                                  disabled={restoringId() === tree.id}
                                  onClick={() => void restore(tree.id, tree.name)}
                                  data-testid={`deleted-tree-restore-${tree.id}`}
                                >
                                  <RotateCcw />
                                  {restoringId() === tree.id
                                    ? t("trees.deleted.restoring")
                                    : t("trees.deleted.restore")}
                                </Button>
                              </Show>
                            </div>
                          </Card>
                        );
                      }}
                    </For>
                  </div>
                </section>
              </Show>

              <Show
                when={trees() && trees()!.length > 0}
                fallback={
                  <Show when={trees()} fallback={<div class="mt-10"><LoadingCards count={3} /></div>}>
                    <Show
                      when={!(pending() && pending()!.length > 0)}
                      fallback={
                        <p class="mt-10 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                          {t("trees.deleted.noneActive")}
                        </p>
                      }
                    >
                      <EmptyTrees onCreate={() => setCreating(true)} />
                    </Show>
                  </Show>
                }
              >
                <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={trees()}>
                    {tree => (
                      <Card class="group relative flex h-full min-h-56 flex-col justify-between gap-0 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-card)]">
                        <A
                          href={`/trees/${tree.id}`}
                          class="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                          aria-label={t("trees.open", { name: tree.name })}
                          data-testid={`tree-open-${tree.id}`}
                        />
                        <div class="pointer-events-none relative z-10">
                          <div class="flex items-start justify-between gap-3">
                            <span class="grid size-11 place-items-center rounded-2xl bg-accent text-accent-foreground">
                              <Sprout size={20} />
                            </span>
                            <Badge variant="secondary" class="uppercase tracking-wide">
                              {t(roleKey(tree.role))}
                            </Badge>
                          </div>
                          <h2 class="mt-5 font-display text-2xl leading-tight tracking-tight">
                            {tree.name}
                          </h2>
                          <Show when={tree.description}>
                            <p class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                              {tree.description}
                            </p>
                          </Show>
                        </div>
                        <div class="pointer-events-none relative z-10 mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                          <span class="flex items-center gap-1.5">
                            <Users size={13} />
                            {t("trees.member", { count: tree.memberCount })}
                          </span>
                          <span>
                            {t("common.person", { count: tree.peopleCount })}
                          </span>
                          <span>{formatRelative(tree.updatedAt, locale())}</span>
                          <span class="ml-auto flex items-center gap-2">
                            <A
                              href={`/trees/${tree.id}/calendar`}
                              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[0.68rem] font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                              aria-label={t("trees.openCalendar", { name: tree.name })}
                              data-testid={`tree-calendar-${tree.id}`}
                            >
                              <CalendarDays size={13} />
                              {t("trees.calendar")}
                            </A>
                            <ArrowUpRight
                              size={15}
                              class="text-primary opacity-0 transition group-hover:opacity-100"
                            />
                          </span>
                        </div>
                      </Card>
                    )}
                  </For>
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    class="group flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-muted-foreground transition hover:border-primary/45 hover:bg-accent/40 hover:text-foreground"
                    data-testid="trees-start-another"
                  >
                    <span class="grid size-11 place-items-center rounded-full border border-border bg-card transition group-hover:border-primary/40">
                      <Plus size={20} />
                    </span>
                    <span class="text-sm font-semibold">{t("trees.startAnother")}</span>
                    <span class="max-w-48 text-center text-xs leading-relaxed">
                      {t("trees.startAnotherHint")}
                    </span>
                  </button>
                </div>
              </Show>
            </main>
            <CreateTreeDialog open={creating()} onClose={() => setCreating(false)} />
            <ImportGedcomDialog open={importing()} onClose={() => setImporting(false)} />
          </>
        )}
      </Show>
    </div>
  );
}

function EmptyTrees(props: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <Card class="mx-auto mt-14 max-w-2xl items-center gap-0 px-6 py-14 text-center">
      <div class="grid size-16 place-items-center rounded-3xl bg-accent text-accent-foreground">
        <Sprout size={30} />
      </div>
      <h2 class="mt-6 font-display text-3xl tracking-tight">{t("trees.empty.title")}</h2>
      <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t("trees.empty.body")}
      </p>
      <Button class="mt-7" onClick={props.onCreate} data-testid="trees-empty-create">
        <Plus />
        {t("trees.empty.create")}
      </Button>
    </Card>
  );
}
