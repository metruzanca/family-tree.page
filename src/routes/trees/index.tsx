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
import { formatDate, formatRelative, roleLabel } from "~/lib/format";
import { daysUntilPurge } from "~/lib/tree-deletion";

export const route = {
  preload: () => {
    requireUserPage();
    getMyTrees();
    getPendingDeletionTrees();
  },
};

export default function TreesPage() {
  return (
    <AppErrorBoundary
      title="We could not load your trees"
      message="Your groves are still safe. The connection to the server may have dropped."
      revalidateKeys={[requireUserPage.key, getMyTrees.key, getPendingDeletionTrees.key]}
      back={{ href: "/", label: "Back home" }}
    >
      <TreesInner />
    </AppErrorBoundary>
  );
}

function TreesInner() {
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
    toast.show(`Restored ${name}.`, "success");
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
                    Import
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCreating(true)}
                    data-testid="trees-new-tree"
                  >
                    <Plus />
                    New tree
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
                  <p class="eyebrow mb-2">Your groves</p>
                  <h1 class="font-display text-4xl tracking-tight sm:text-5xl">
                    The families you keep.
                  </h1>
                  <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Each tree is a private graph. Invite relatives to add stories, photographs and
                    the connections between them.
                  </p>
                </div>
                <div class="hidden items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm shadow-xs sm:flex">
                  <span class="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Sprout size={17} />
                  </span>
                  <div>
                    <p class="font-semibold leading-tight">{currentUser().displayName}</p>
                    <p class="text-xs text-muted-foreground">
                      {trees()?.length ?? 0} {trees()?.length === 1 ? "tree" : "trees"}
                    </p>
                  </div>
                </div>
              </section>

              <Show when={pending() && pending()!.length > 0}>
                <section class="mt-10" data-testid="deleted-trees-section">
                  <div class="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 class="font-display text-2xl tracking-tight">Recently deleted</h2>
                      <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                        These trees are kept for 30 days. Restore one any time before the date
                        shown.
                      </p>
                    </div>
                  </div>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <For each={pending()}>
                      {tree => {
                        const days = () => daysUntilPurge(tree.purgeAfter);
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
                                  {tree.peopleCount}{" "}
                                  {tree.peopleCount === 1 ? "person" : "people"} ·{" "}
                                  {tree.memberCount}{" "}
                                  {tree.memberCount === 1 ? "member" : "members"}
                                </p>
                              </div>
                            </div>
                            <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                              Requested by {tree.requestedByName}{" "}
                              {formatRelative(tree.deletedAt)}.{" "}
                              {tree.purgeAfter
                                ? `Erased on ${formatDate(tree.purgeAfter)}${
                                    days() === 0
                                      ? " (the next maintenance run)"
                                      : days() === 1
                                        ? " (tomorrow)"
                                        : ` (in ${days()} days)`
                                  }.`
                                : "Erasure is overdue and will run shortly."}
                            </p>
                            <div class="mt-4 flex flex-wrap items-center gap-2">
                              <Show
                                when={tree.role === "owner"}
                                fallback={
                                  <p class="text-xs leading-relaxed text-muted-foreground">
                                    Restoring needs an owner. Ask one of the owners to restore it.
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
                                  {restoringId() === tree.id ? "Restoring…" : "Restore tree"}
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
                          You have no active trees right now.
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
                          aria-label={`Open ${tree.name}`}
                        />
                        <div class="pointer-events-none relative z-10">
                          <div class="flex items-start justify-between gap-3">
                            <span class="grid size-11 place-items-center rounded-2xl bg-accent text-accent-foreground">
                              <Sprout size={20} />
                            </span>
                            <Badge variant="secondary" class="uppercase tracking-wide">
                              {roleLabel(tree.role)}
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
                            {tree.memberCount} {tree.memberCount === 1 ? "member" : "members"}
                          </span>
                          <span>
                            {tree.peopleCount} {tree.peopleCount === 1 ? "person" : "people"}
                          </span>
                          <span>{formatRelative(tree.updatedAt)}</span>
                          <span class="ml-auto flex items-center gap-2">
                            <A
                              href={`/trees/${tree.id}/calendar`}
                              class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[0.68rem] font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                              aria-label={`Open ${tree.name} calendar`}
                            >
                              <CalendarDays size={13} />
                              Calendar
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
                  >
                    <span class="grid size-11 place-items-center rounded-full border border-border bg-card transition group-hover:border-primary/40">
                      <Plus size={20} />
                    </span>
                    <span class="text-sm font-semibold">Start another tree</span>
                    <span class="max-w-48 text-center text-xs leading-relaxed">
                      A separate branch for another side of the family.
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
  return (
    <Card class="mx-auto mt-14 max-w-2xl items-center gap-0 px-6 py-14 text-center">
      <div class="grid size-16 place-items-center rounded-3xl bg-accent text-accent-foreground">
        <Sprout size={30} />
      </div>
      <h2 class="mt-6 font-display text-3xl tracking-tight">Plant your first tree</h2>
      <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Add the people you remember, connect parents and partners, then invite a relative to help
        fill in the branches.
      </p>
      <Button class="mt-7" onClick={props.onCreate}>
        <Plus />
        Create a family tree
      </Button>
    </Card>
  );
}
