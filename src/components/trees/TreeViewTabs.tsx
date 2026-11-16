import { A } from "@solidjs/router";
import { CalendarDays, Network } from "lucide-solid";
import { cx } from "~/lib/utils";

type TreeViewTabsProps = {
  treeId: string;
  active: "graph" | "calendar";
  variant?: "glass" | "page";
};

export function TreeViewTabs(props: TreeViewTabsProps) {
  const glass = () => props.variant !== "page";

  const container = () =>
    glass()
      ? "border border-white/10 bg-black/20"
      : "border border-border bg-muted/70";

  const item = (selected: boolean) =>
    cx(
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2",
      glass()
        ? selected
          ? "bg-white/20 text-white focus-visible:ring-white/40"
          : "text-white/55 hover:text-white focus-visible:ring-white/40"
        : selected
          ? "bg-card text-foreground shadow-xs focus-visible:ring-ring/35"
          : "text-muted-foreground hover:text-foreground focus-visible:ring-ring/35",
    );

  return (
    <nav
      aria-label="Tree views"
      class={cx("flex items-center gap-0.5 rounded-full p-0.5", container())}
    >
      <A
        href={`/trees/${props.treeId}`}
        class={item(props.active === "graph")}
        aria-current={props.active === "graph" ? "page" : undefined}
      >
        <Network size={14} />
        <span class="hidden sm:inline">Graph</span>
      </A>
      <A
        href={`/trees/${props.treeId}/calendar`}
        class={item(props.active === "calendar")}
        aria-current={props.active === "calendar" ? "page" : undefined}
      >
        <CalendarDays size={14} />
        <span class="hidden sm:inline">Calendar</span>
      </A>
    </nav>
  );
}
