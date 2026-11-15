import { A, createAsync } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { ArrowUpRight, Plus, Sprout, Users } from "lucide-solid";
import { getMyTrees, requireUserPage } from "~/api";
import { AppHeader } from "~/components/app/AppHeader";
import { CreateTreeDialog } from "~/components/trees/CreateTreeDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { LoadingCards } from "~/components/ui/Loading";
import { formatRelative, roleLabel } from "~/lib/format";

export const route = {
  preload: () => {
    requireUserPage();
    getMyTrees();
  },
};

export default function TreesPage() {
  const user = createAsync(() => requireUserPage());
  const trees = createAsync(() => getMyTrees());
  const [creating, setCreating] = createSignal(false);

  return (
    <div class="page-shell min-h-[100dvh]">
      <Show when={user()}>
        {currentUser => (
          <>
            <AppHeader
              user={currentUser()}
              actions={
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus />
                  New tree
                </Button>
              }
            />
            <main class="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6">
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

              <Show
                when={trees() && trees()!.length > 0}
                fallback={
                  <Show when={trees()} fallback={<div class="mt-10"><LoadingCards count={3} /></div>}>
                    <EmptyTrees onCreate={() => setCreating(true)} />
                  </Show>
                }
              >
                <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={trees()}>
                    {tree => (
                      <A href={`/trees/${tree.id}`} class="group block focus-visible:outline-none">
                        <Card class="h-full min-h-56 justify-between gap-0 p-5 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[var(--shadow-card)] group-focus-visible:ring-[3px] group-focus-visible:ring-ring/35">
                          <div>
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
                          <div class="mt-6 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                            <span class="flex items-center gap-1.5">
                              <Users size={13} />
                              {tree.memberCount} {tree.memberCount === 1 ? "member" : "members"}
                            </span>
                            <span>
                              {tree.peopleCount} {tree.peopleCount === 1 ? "person" : "people"}
                            </span>
                            <span>{formatRelative(tree.updatedAt)}</span>
                            <ArrowUpRight
                              size={15}
                              class="text-primary opacity-0 transition group-hover:opacity-100"
                            />
                          </div>
                        </Card>
                      </A>
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
