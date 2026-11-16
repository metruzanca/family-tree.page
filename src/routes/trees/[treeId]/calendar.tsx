import { Show, Suspense } from "solid-js";
import { A, createAsync, useParams } from "@solidjs/router";
import { CalendarPlus, Network } from "lucide-solid";
import { getTreeGraph, requireUserPage } from "~/api";
import { AppHeader } from "~/components/app/AppHeader";
import { TreeCalendar } from "~/components/calendar/TreeCalendar";
import { buttonVariants } from "~/components/ui/button";
import { LoadingScreen } from "~/components/ui/Loading";

export const route = {
  preload: ({ params }: { params: { treeId: string } }) => {
    requireUserPage();
    getTreeGraph(params.treeId);
  },
};

export default function TreeCalendarPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TreeCalendarInner />
    </Suspense>
  );
}

function TreeCalendarInner() {
  const params = useParams<{ treeId: string }>();
  const user = createAsync(() => requireUserPage());
  const data = createAsync(() => getTreeGraph(params.treeId));

  return (
    <Show when={user()}>
      {currentUser => (
        <Show when={data()}>
          {graph => (
            <div class="page-shell min-h-[100dvh]">
              <AppHeader
                user={currentUser()}
                back={{ href: `/trees/${params.treeId}`, label: "Back to tree" }}
                center={graph().tree.name}
              />
              <main class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
                <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p class="eyebrow mb-2">Tree calendar</p>
                    <h1 class="font-display text-4xl tracking-tight">{graph().tree.name}</h1>
                    <p class="mt-2 max-w-xl text-sm text-muted-foreground">
                      Birthdays and anniversaries for everyone in this tree. Living relatives are
                      counted forward so you never miss a birthday.
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <A
                      href="/settings#calendar-subscription"
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      <CalendarPlus size={15} />
                      Subscribe
                    </A>
                    <A
                      href={`/trees/${params.treeId}`}
                      class={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      <Network size={15} />
                      Open graph
                    </A>
                  </div>
                </div>

                <TreeCalendar treeId={params.treeId} people={graph().people} />
              </main>
            </div>
          )}
        </Show>
      )}
    </Show>
  );
}
