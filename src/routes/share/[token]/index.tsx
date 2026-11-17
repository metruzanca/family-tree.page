import { A, createAsync, useParams } from "@solidjs/router";
import { Eye, Lock, Sprout } from "lucide-solid";
import { getSharedTree } from "~/api";
import { AppErrorBoundary } from "~/components/app/AppErrorBoundary";
import { BrandMark } from "~/components/app/AppHeader";
import { SharedTreeView } from "~/components/trees/SharedTreeView";
import { buttonVariants } from "~/components/ui/button";
import { LoadingScreen } from "~/components/ui/Loading";

export const route = {
  preload: ({ params }: { params: { token: string } }) => getSharedTree(params.token),
};

export default function SharePage() {
  return (
    <AppErrorBoundary
      title="We could not open this shared tree"
      message="The link may still be good. Try again, or ask the owner for a new one."
      revalidateKeys={[getSharedTree.key]}
      back={{ href: "/", label: "Go to the home page" }}
    >
      <ShareInner />
    </AppErrorBoundary>
  );
}

function ShareInner() {
  const params = useParams<{ token: string }>();
  const shared = createAsync(() => getSharedTree(params.token));

  if (shared() === undefined) return <LoadingScreen />;

  const data = shared();
  if (!data) {
    return (
      <main class="page-shell flex min-h-[100dvh] flex-col" data-testid="share-unavailable">
        <div class="flex items-center justify-between px-5 py-5 sm:px-8">
          <BrandMark />
        </div>
        <div class="flex flex-1 items-center justify-center px-4 pb-20">
          <div class="w-full max-w-md rounded-3xl border border-border bg-card/60 p-8 text-center">
            <div class="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-muted text-muted-foreground">
              <Lock size={24} />
            </div>
            <h1 class="mt-5 font-display text-2xl tracking-tight">This link is not active</h1>
            <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              The share link may have expired or been revoked. Ask the tree owner for a new one.
            </p>
            <A href="/" class={buttonVariants({ class: "mt-6" })} data-testid="share-unavailable-home">
              <Sprout size={15} />
              Start your own tree
            </A>
          </div>
        </div>
      </main>
    );
  }

  const livingNote =
    data.share.livingVisibility === "hidden"
      ? "Living people are hidden"
      : data.share.livingVisibility === "name"
        ? "Living people show names only"
        : "Living people show full details";

  return (
    <div class="relative" data-testid="share-page">
      <SharedTreeView
        graph={data.graph}
        backHref="/"
        backLabel="Home"
        badgeLabel="Shared"
        allowDownload={false}
        thumbUrlFor={fileId => `/share/${params.token}/files/${fileId}/thumb`}
        fileUrlFor={file => file.thumbUrl ?? ""}
      />
      <div class="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-3">
        <div
          class="pointer-events-auto inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-black/55 px-4 py-1.5 text-[0.7rem] text-white/70 shadow-lg backdrop-blur"
          data-testid="share-banner"
        >
          <Eye size={13} class="text-gold" />
          <span class="font-semibold text-white">Read-only share</span>
          <span aria-hidden="true">·</span>
          <span>{livingNote}</span>
        </div>
      </div>
    </div>
  );
}
