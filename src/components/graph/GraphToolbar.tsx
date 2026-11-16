import { A } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import {
  ArrowDownUp,
  ArrowLeft,
  CalendarDays,
  Image as ImageIcon,
  ImageOff,
  Maximize2,
  MoreHorizontal,
  Network,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Waves,
  ZoomIn,
  ZoomOut,
} from "lucide-solid";
import type { GenerationDirection } from "~/lib/graph";
import type { PresencePeer, PresenceStatus } from "~/lib/presence-protocol";
import type { TreeRole } from "~/server/guards";
import { roleLabel } from "~/lib/format";
import { PresenceBar } from "../presence/PresenceBar";
import { Badge } from "./../ui/badge";
import { Kbd } from "./../ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "./../ui/tooltip";

type ToolbarProps = {
  treeId: string;
  treeName: string;
  peopleCount: number;
  role: TreeRole;
  showMedia: boolean;
  layout: "generations" | "freeform";
  generationDirection: GenerationDirection;
  presence: {
    status: PresenceStatus;
    peers: PresencePeer[];
    selfPeerId: string | null;
  };
  resolveNode: (nodeId: string | null) => string | null;
  onToggleMedia: () => void;
  onToggleLayout: () => void;
  onFlipDirection: () => void;
  onResetLayout: () => void;
  onSearch: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddPerson: () => void;
};

const glass =
  "flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 text-sm text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

export function GraphToolbar(props: ToolbarProps) {
  const editable = () => props.role === "owner" || props.role === "editor";
  return (
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div class="pointer-events-auto flex items-center gap-2">
        <A href="/trees" class={`${glass} px-3`} aria-label="Back to your trees">
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">Trees</span>
        </A>
        <div class="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md">
          <span class="max-w-44 truncate text-sm font-semibold text-white/90 sm:max-w-xs">
            {props.treeName}
          </span>
          <span class="hidden text-[0.65rem] uppercase tracking-wide text-white/40 sm:inline">
            {props.peopleCount} {props.peopleCount === 1 ? "person" : "people"}
          </span>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/10 text-[0.58rem] font-semibold uppercase tracking-wide text-white/60"
          >
            {roleLabel(props.role)}
          </Badge>
        </div>

        <PresenceBar
          status={props.presence.status}
          peers={props.presence.peers}
          selfPeerId={props.presence.selfPeerId}
          resolveNode={props.resolveNode}
        />

        <div class="ml-auto flex items-center gap-1.5">
          <ToolButton label="Search people and files" shortcut="/" onClick={props.onSearch}>
            <Search size={17} />
          </ToolButton>
          <Show when={editable()}>
            <button
              type="button"
              class={`${glass} font-semibold`}
              aria-label="Add person"
              onClick={props.onAddPerson}
            >
              <Plus size={16} />
              <span class="hidden sm:inline">Add person</span>
            </button>
          </Show>
          <div class="hidden items-center gap-1.5 lg:flex">
            <ToolButton
              active={props.showMedia}
              label={props.showMedia ? "Hide media" : "Show media"}
              onClick={props.onToggleMedia}
            >
              <Show when={props.showMedia} fallback={<ImageOff size={17} />}>
                <ImageIcon size={17} />
              </Show>
            </ToolButton>
            <ToolButton
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
            </ToolButton>
            <ToolButton
              label={
                props.generationDirection === "oldest-top"
                  ? "Oldest at top. Flip so oldest is at the bottom"
                  : "Oldest at bottom. Flip so oldest is at the top"
              }
              onClick={props.onFlipDirection}
            >
              <ArrowDownUp size={17} />
            </ToolButton>
            <ToolButton label="Zoom out" shortcut="−" onClick={props.onZoomOut}>
              <ZoomOut size={17} />
            </ToolButton>
            <ToolButton label="Zoom in" shortcut="+" onClick={props.onZoomIn}>
              <ZoomIn size={17} />
            </ToolButton>
            <ToolButton label="Fit tree" shortcut="F" onClick={props.onFit}>
              <Maximize2 size={17} />
            </ToolButton>
            <ToolButton label="Reset layout" onClick={props.onResetLayout}>
              <RotateCcw size={17} />
            </ToolButton>
            <ToolButton label="Calendar" href={`/trees/${props.treeId}/calendar`}>
              <CalendarDays size={17} />
            </ToolButton>
            <ToolButton label="Tree settings" href={`/trees/${props.treeId}/settings`}>
              <Settings size={17} />
            </ToolButton>
          </div>

          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger class={`${glass} px-2 lg:hidden`} aria-label="More controls">
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
              <GlassItem
                label={props.showMedia ? "Hide media" : "Show media"}
                onSelect={props.onToggleMedia}
              >
                <Show when={props.showMedia} fallback={<ImageOff />}>
                  <ImageIcon />
                </Show>
              </GlassItem>
              <GlassItem
                label={props.layout === "generations" ? "Freeform layout" : "Generation layout"}
                onSelect={props.onToggleLayout}
              >
                <Show when={props.layout === "generations"} fallback={<Waves />}>
                  <Network />
                </Show>
              </GlassItem>
              <GlassItem label="Flip generations" onSelect={props.onFlipDirection}>
                <ArrowDownUp />
              </GlassItem>
              <DropdownMenuSeparator class="my-1 bg-white/10" />
              <GlassItem label="Zoom out" onSelect={props.onZoomOut}>
                <ZoomOut />
              </GlassItem>
              <GlassItem label="Zoom in" onSelect={props.onZoomIn}>
                <ZoomIn />
              </GlassItem>
              <GlassItem label="Fit tree" onSelect={props.onFit}>
                <Maximize2 />
              </GlassItem>
              <GlassItem label="Reset layout" onSelect={props.onResetLayout}>
                <RotateCcw />
              </GlassItem>
              <DropdownMenuSeparator class="my-1 bg-white/10" />
              <DropdownMenuItem
                as={A}
                href={`/trees/${props.treeId}/calendar`}
                class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
              >
                <CalendarDays />
                Calendar
              </DropdownMenuItem>
              <DropdownMenuItem
                as={A}
                href={`/trees/${props.treeId}/settings`}
                class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
              >
                <Settings />
                Tree settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function ToolButton(props: {
  label: string;
  shortcut?: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  children: JSX.Element;
}) {
  const classes = () =>
    `size-10 ${glass} px-0 ${
      props.active ? "!border-white/20 !bg-white/15 !text-white" : "!text-white/55 hover:!text-white"
    }`;

  return (
    <Tooltip placement="bottom">
      <Show
        when={props.href}
        fallback={
          <TooltipTrigger
            as="button"
            type="button"
            class={classes()}
            aria-label={props.label}
            aria-pressed={props.active}
            onClick={props.onClick}
          >
            {props.children}
          </TooltipTrigger>
        }
      >
        <TooltipTrigger as={A} href={props.href!} class={classes()} aria-label={props.label}>
          {props.children}
        </TooltipTrigger>
      </Show>
      <TooltipPortal>
        <TooltipContent class="flex items-center gap-2">
          {props.label}
          <Show when={props.shortcut}>
            <Kbd>{props.shortcut}</Kbd>
          </Show>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

function GlassItem(props: {
  label: string;
  onSelect: () => void;
  children: JSX.Element;
}) {
  return (
    <DropdownMenuItem
      class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
      onSelect={props.onSelect}
    >
      {props.children}
      {props.label}
    </DropdownMenuItem>
  );
}
