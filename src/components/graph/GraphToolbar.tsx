import { A } from "@solidjs/router";
import { Show } from "solid-js";
import {
  ArrowLeft,
  Image as ImageIcon,
  ImageOff,
  Maximize2,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  Settings,
  Waves,
  ZoomIn,
  ZoomOut,
} from "lucide-solid";
import type { TreeRole } from "~/server/guards";
import { roleLabel } from "~/lib/format";

type ToolbarProps = {
  treeId: string;
  treeName: string;
  peopleCount: number;
  role: TreeRole;
  showMedia: boolean;
  layout: "generations" | "freeform";
  onToggleMedia: () => void;
  onToggleLayout: () => void;
  onSearch: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddPerson: () => void;
};

const control =
  "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white";

export function GraphToolbar(props: ToolbarProps) {
  const editable = () => props.role === "owner" || props.role === "editor";
  return (
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div class="pointer-events-auto flex items-center gap-2">
        <A
          href="/trees"
          class="flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 text-sm text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white"
          aria-label="Back to your trees"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">Trees</span>
        </A>
        <div class="min-w-0 rounded-full border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
          <div class="flex items-center gap-2">
            <span class="max-w-44 truncate text-sm font-semibold text-white/90 sm:max-w-xs">
              {props.treeName}
            </span>
            <span class="hidden text-[0.65rem] uppercase tracking-wide text-white/40 sm:inline">
              {props.peopleCount} {props.peopleCount === 1 ? "person" : "people"}
            </span>
            <span class="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide text-white/60">
              {roleLabel(props.role)}
            </span>
          </div>
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <button type="button" class={control} onClick={props.onSearch} aria-label="Search people and files" title="Search">
            <Search size={17} />
          </button>
          <Show when={editable()}>
            <button
              type="button"
              class="flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 text-sm font-semibold text-white/80 backdrop-blur-md transition hover:bg-black/55 hover:text-white"
              onClick={props.onAddPerson}
            >
              <Plus size={16} />
              <span class="hidden sm:inline">Add person</span>
            </button>
          </Show>
          <div class="hidden items-center gap-1.5 sm:flex">
            <ToolbarToggle
              active={props.showMedia}
              label={props.showMedia ? "Hide media" : "Show media"}
              onClick={props.onToggleMedia}
            >
              <Show when={props.showMedia} fallback={<ImageOff size={17} />}>
                <ImageIcon size={17} />
              </Show>
            </ToolbarToggle>
            <ToolbarToggle
              active={props.layout === "generations"}
              label={
                props.layout === "generations"
                  ? "Switch to freeform layout"
                  : "Switch to generation layout"
              }
              onClick={props.onToggleLayout}
            >
              <Show when={props.layout === "generations"} fallback={<Waves size={17} />}>
                <Network size={17} />
              </Show>
            </ToolbarToggle>
            <button type="button" class={control} onClick={props.onZoomOut} aria-label="Zoom out" title="Zoom out">
              <ZoomOut size={17} />
            </button>
            <button type="button" class={control} onClick={props.onZoomIn} aria-label="Zoom in" title="Zoom in">
              <ZoomIn size={17} />
            </button>
            <button type="button" class={control} onClick={props.onFit} aria-label="Fit tree" title="Fit tree">
              <Maximize2 size={17} />
            </button>
            <A href={`/trees/${props.treeId}/settings`} class={control} aria-label="Tree settings" title="Tree settings">
              <Settings size={17} />
            </A>
          </div>

          <details class="group relative sm:hidden">
            <summary class={`${control} list-none cursor-pointer [&::-webkit-details-marker]:hidden`} aria-label="More controls">
              <MoreHorizontal size={18} />
            </summary>
            <div class="absolute right-0 top-12 w-52 rounded-2xl border border-white/10 bg-[#161b14] p-1.5 text-sm text-white/80 shadow-xl">
              <MobileAction label={props.showMedia ? "Hide media" : "Show media"} onClick={props.onToggleMedia}>
                <Show when={props.showMedia} fallback={<ImageOff size={15} />}>
                  <ImageIcon size={15} />
                </Show>
              </MobileAction>
              <MobileAction
                label={props.layout === "generations" ? "Freeform layout" : "Generation layout"}
                onClick={props.onToggleLayout}
              >
                <Show when={props.layout === "generations"} fallback={<Waves size={15} />}>
                  <Network size={15} />
                </Show>
              </MobileAction>
              <MobileAction label="Zoom out" onClick={props.onZoomOut}>
                <ZoomOut size={15} />
              </MobileAction>
              <MobileAction label="Zoom in" onClick={props.onZoomIn}>
                <ZoomIn size={15} />
              </MobileAction>
              <MobileAction label="Fit tree" onClick={props.onFit}>
                <Maximize2 size={15} />
              </MobileAction>
              <A
                href={`/trees/${props.treeId}/settings`}
                class="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/10"
              >
                <Settings size={15} />
                Tree settings
              </A>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function ToolbarToggle(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      class={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition ${
        props.active
          ? "border-white/20 bg-white/15 text-white"
          : "border-white/10 bg-black/35 text-white/55 hover:bg-black/55 hover:text-white"
      }`}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function MobileAction(props: { label: string; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10"
      onClick={event => {
        props.onClick();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      {props.children}
      {props.label}
    </button>
  );
}
