import { A } from "@solidjs/router";
import { ArrowRight } from "lucide-solid";
import { SharedTreeView } from "~/components/trees/SharedTreeView";
import {
  demoMediaById,
  demoThumbUrl,
  demoTree,
} from "~/components/landing/demo-tree";

export default function DemoPage() {
  return (
    <div class="relative" data-testid="demo-page">
      <SharedTreeView
        graph={demoTree}
        backHref="/"
        backLabel="Home"
        badgeLabel="Demo"
        allowDownload={false}
        thumbUrlFor={demoThumbUrl}
        fileUrlFor={file => demoMediaById[file.id]?.fullUrl ?? demoThumbUrl(file.id)}
      />
      <div class="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-3">
        <div
          class="pointer-events-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-white/85 shadow-xl backdrop-blur-md sm:flex-row sm:justify-between"
          data-testid="demo-banner"
        >
          <p class="text-center text-xs leading-relaxed sm:text-left">
            <span class="font-semibold text-white">This is a live demo.</span> Everything is
            read-only. Start a tree to add your own family.
          </p>
          <A
            href="/register"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-semibold text-[#161a12] transition hover:brightness-105"
            data-testid="demo-banner-signup"
          >
            Start your tree
            <ArrowRight size={13} />
          </A>
        </div>
      </div>
    </div>
  );
}
