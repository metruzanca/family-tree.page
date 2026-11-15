import { A, createAsync } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { ArrowUpRight, Plus, Sprout, Users } from "lucide-solid";
import { getMyTrees, requireUserPage } from "~/api";
import { AppHeader } from "~/components/app/AppHeader";
import { CreateTreeDialog } from "~/components/trees/CreateTreeDialog";
import { Button } from "~/components/ui/Button";
import { LoadingRows } from "~/components/ui/Loading";
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
                  <Plus size={15} />
                  New tree
                </Button>
              }
            />
            <main class="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6">
              <section class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-moss">
                    Your groves
                  </p>
                  <h1 class="font-display text-4xl tracking-tight sm:text-5xl">
                    The families you keep.
                  </h1>
                  <p class="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                    Each tree is a private graph. Invite relatives to add stories, photographs and
                    the connections between them.
                  </p>
                </div>
                <div class="hidden rounded-2xl border border-line bg-raised/60 px-4 py-3 text-sm sm:block">
                  <p class="font-semibold">{currentUser().displayName}</p>
                  <p class="text-xs text-muted">
                    {trees()?.length ?? 0} {trees()?.length === 1 ? "tree" : "trees"}
                  </p>
                </div>
              </section>

              <Show
                when={trees() && trees()!.length > 0}
                fallback={
                  <Show when={trees()} fallback={<div class="mt-10"><LoadingRows count={3} /></div>}>
                    <EmptyTrees onCreate={() => setCreating(true)} />
                  </Show>
                }
              >
                <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <For each={trees()}>
                    {tree => (
                      <A
                        href={`/trees/${tree.id}`}
                        class="paper-card group relative flex min-h-56 flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-moss/40 hover:shadow-lg"
                      >
                        <div>
                          <div class="flex items-start justify-between gap-3">
                            <div class="grid h-11 w-11 place-items-center rounded-2xl bg-moss-soft text-moss">
                              <Sprout size={20} />
                            </div>
                            <span class="badge">{roleLabel(tree.role)}</span>
                          </div>
                          <h2 class="mt-5 font-display text-2xl leading-tight tracking-tight">
                            {tree.name}
                          </h2>
                          <Show when={tree.description}>
                            <p class="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
                              {tree.description}
                            </p>
                          </Show>
                        </div>
                        <div class="mt-6 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
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
                            class="text-moss opacity-0 transition group-hover:opacity-100"
                          />
                        </div>
                      </A>
                    )}
                  </For>
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    class="group flex min-h-56 flex-col items-center justify-center gap-3 rounded-[1.25rem] border border-dashed border-line text-muted transition hover:border-moss/45 hover:bg-moss/5 hover:text-ink"
                  >
                    <span class="grid h-11 w-11 place-items-center rounded-full border border-line bg-raised transition group-hover:border-moss/40">
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
    <div class="paper-card mx-auto mt-14 max-w-2xl px-6 py-14 text-center">
      <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-moss-soft text-moss">
        <Sprout size={30} />
      </div>
      <h2 class="mt-6 font-display text-3xl tracking-tight">Plant your first tree</h2>
      <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        Add the people you remember, connect parents and partners, then invite a relative to help
        fill in the branches.
      </p>
      <Button class="mt-7" onClick={props.onCreate}>
        <Plus size={16} />
        Create a family tree
      </Button>
    </div>
  );
}
