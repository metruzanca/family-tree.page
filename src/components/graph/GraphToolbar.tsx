import { A } from "@solidjs/router";
import { For, Show, type JSX } from "solid-js";
import {
  ArrowDownUp,
  ArrowLeft,
  CalendarDays,
  History,
  Image as ImageIcon,
  ImageOff,
  Maximize2,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Target,
  UserRound,
  ZoomIn,
  ZoomOut,
} from "lucide-solid";
import type { GenerationDirection } from "~/lib/graph";
import { FOCUS_BANDS, type FocusRadius } from "~/lib/focus";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "./../ui/tooltip";

type ToolbarProps = {
  treeId: string;
  treeName: string;
  role: TreeRole;
  showMedia: boolean;
  generationDirection: GenerationDirection;
  focus: {
    personName: string | null;
    radius: FocusRadius;
    visibleCount: number;
    total: number;
  };
  onFocusRadius: (radius: FocusRadius) => void;
  onChangeFocusPerson: () => void;
  presence?: {
    status: PresenceStatus;
    peers: PresencePeer[];
    selfPeerId: string | null;
  };
  resolveNode: (nodeId: string | null) => string | null;
  onToggleMedia: () => void;
  onFlipDirection: () => void;
  onSearch: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddPerson?: () => void;
  showFocus?: boolean;
  showTreeLinks?: boolean;
  backHref?: string;
  backLabel?: string;
  badgeLabel?: string;
};

const glass =
  "flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 text-sm text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

export function GraphToolbar(props: ToolbarProps) {
  const editable = () => props.role === "owner" || props.role === "editor";
  return (
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div class="pointer-events-auto flex items-center gap-2">
        <A
          href={props.backHref ?? "/trees"}
          class={`${glass} px-3`}
          aria-label={props.backLabel ?? "Back to your trees"}
          data-testid="tree-toolbar-back"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">{props.backLabel ?? "Trees"}</span>
        </A>
        <div
          class="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 backdrop-blur-md"
          data-testid="tree-toolbar-title"
        >
          <span class="max-w-44 truncate text-sm font-semibold text-white/90 sm:max-w-xs">
            {props.treeName}
          </span>
          <span class="hidden text-[0.65rem] uppercase tracking-wide text-white/40 sm:inline">
            {props.focus.personName && props.focus.radius !== "all"
              ? `${props.focus.visibleCount} of ${props.focus.total}`
              : props.focus.total}{" "}
            {props.focus.total === 1 ? "person" : "people"}
          </span>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/10 text-[0.58rem] font-semibold uppercase tracking-wide text-white/60"
          >
            {props.badgeLabel ?? roleLabel(props.role)}
          </Badge>
        </div>

        <Show when={props.presence}>
          <PresenceBar
            status={props.presence!.status}
            peers={props.presence!.peers}
            selfPeerId={props.presence!.selfPeerId}
            resolveNode={props.resolveNode}
          />
        </Show>

        <div class="ml-auto flex items-center gap-1.5">
          <ToolButton
            testId="tree-toolbar-search"
            label="Search people and files"
            shortcut="/"
            onClick={props.onSearch}
          >
            <Search size={17} />
          </ToolButton>
          <Show when={props.showFocus !== false}>
            <FocusMenu
              focus={props.focus}
              onRadius={props.onFocusRadius}
              onChangePerson={props.onChangeFocusPerson}
            />
          </Show>
          <Show when={editable() && props.onAddPerson}>
            <button
              type="button"
              class={`${glass} font-semibold`}
              aria-label="Add person"
              data-testid="tree-toolbar-add-person"
              onClick={() => props.onAddPerson?.()}
            >
              <Plus size={16} />
              <span class="hidden sm:inline">Add person</span>
            </button>
          </Show>
          <div class="hidden items-center gap-1.5 lg:flex">
            <ToolButton
              testId="tree-toolbar-media"
              active={props.showMedia}
              label={props.showMedia ? "Hide media" : "Show media"}
              onClick={props.onToggleMedia}
            >
              <Show when={props.showMedia} fallback={<ImageOff size={17} />}>
                <ImageIcon size={17} />
              </Show>
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-flip"
              label={
                props.generationDirection === "oldest-top"
                  ? "Oldest at top. Flip so oldest is at the bottom"
                  : "Oldest at bottom. Flip so oldest is at the top"
              }
              onClick={props.onFlipDirection}
            >
              <ArrowDownUp size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-zoom-out"
              label="Zoom out"
              shortcut="−"
              onClick={props.onZoomOut}
            >
              <ZoomOut size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-zoom-in"
              label="Zoom in"
              shortcut="+"
              onClick={props.onZoomIn}
            >
              <ZoomIn size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-fit"
              label="Fit tree"
              shortcut="F"
              onClick={props.onFit}
            >
              <Maximize2 size={17} />
            </ToolButton>
            <Show when={props.showTreeLinks !== false}>
              <ToolButton
                testId="tree-toolbar-activity"
                label="Activity"
                href={`/trees/${props.treeId}/activity`}
              >
                <History size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-calendar"
                label="Calendar"
                href={`/trees/${props.treeId}/calendar`}
              >
                <CalendarDays size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-settings"
                label="Tree settings"
                href={`/trees/${props.treeId}/settings`}
              >
                <Settings size={17} />
              </ToolButton>
            </Show>
          </div>

          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
              class={`${glass} px-2 lg:hidden`}
              aria-label="More controls"
              data-testid="tree-toolbar-more"
            >
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
              <GlassItem
                testId="tree-toolbar-more-media"
                label={props.showMedia ? "Hide media" : "Show media"}
                onSelect={props.onToggleMedia}
              >
                <Show when={props.showMedia} fallback={<ImageOff />}>
                  <ImageIcon />
                </Show>
              </GlassItem>
              <GlassItem
                testId="tree-toolbar-more-flip"
                label="Flip generations"
                onSelect={props.onFlipDirection}
              >
                <ArrowDownUp />
              </GlassItem>
              <Show when={props.showFocus !== false}>
                <GlassItem
                  testId="tree-toolbar-more-focus-person"
                  label={
                    props.focus.personName
                      ? `Focused on ${props.focus.personName}. Change who you are`
                      : "Tell us who you are"
                  }
                  onSelect={props.onChangeFocusPerson}
                >
                  <UserRound />
                </GlassItem>
                <Show when={props.focus.radius !== "all"}>
                  <GlassItem
                    testId="tree-toolbar-more-show-all"
                    label="Show the whole tree"
                    onSelect={() => props.onFocusRadius("all")}
                  >
                    <Target />
                  </GlassItem>
                </Show>
              </Show>
              <DropdownMenuSeparator class="my-1 bg-white/10" />
              <GlassItem
                testId="tree-toolbar-more-zoom-out"
                label="Zoom out"
                onSelect={props.onZoomOut}
              >
                <ZoomOut />
              </GlassItem>
              <GlassItem
                testId="tree-toolbar-more-zoom-in"
                label="Zoom in"
                onSelect={props.onZoomIn}
              >
                <ZoomIn />
              </GlassItem>
              <GlassItem testId="tree-toolbar-more-fit" label="Fit tree" onSelect={props.onFit}>
                <Maximize2 />
              </GlassItem>
              <Show when={props.showTreeLinks !== false}>
                <DropdownMenuSeparator class="my-1 bg-white/10" />
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/activity`}
                  data-testid="tree-toolbar-more-activity"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <History />
                  Activity
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/calendar`}
                  data-testid="tree-toolbar-more-calendar"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <CalendarDays />
                  Calendar
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/settings`}
                  data-testid="tree-toolbar-more-settings"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <Settings />
                  Tree settings
                </DropdownMenuItem>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function FocusMenu(props: {
  focus: {
    personName: string | null;
    radius: FocusRadius;
    visibleCount: number;
    total: number;
  };
  onRadius: (radius: FocusRadius) => void;
  onChangePerson: () => void;
}) {
  return (
    <DropdownMenu placement="bottom-end">
      <DropdownMenuTrigger
        class={`${glass} size-10 px-0 ${
          props.focus.personName ? "!text-white" : "!text-white/55 hover:!text-white"
        }`}
        aria-label="Focus and visibility"
        data-testid="tree-toolbar-focus"
      >
        <Target size={17} />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-72 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
        <div class="px-3 pb-1 pt-2">
          <p class="text-xs font-semibold text-white/90">
            {props.focus.personName
              ? `Focused on ${props.focus.personName}`
              : "Showing the whole tree"}
          </p>
          <p class="mt-0.5 text-[0.7rem] text-white/45">
            {props.focus.visibleCount} of {props.focus.total} people visible
          </p>
        </div>
        <DropdownMenuSeparator class="my-1 bg-white/10" />
        <DropdownMenuRadioGroup
          value={String(props.focus.radius)}
          onChange={value => {
            const band = FOCUS_BANDS.find(candidate => String(candidate.radius) === value);
            if (band) props.onRadius(band.radius);
          }}
        >
          <For each={FOCUS_BANDS}>
            {band => (
              <DropdownMenuRadioItem
                value={String(band.radius)}
                data-testid={`tree-toolbar-focus-radius-${band.radius}`}
                class="items-start gap-2 rounded-xl py-2 pr-2 pl-8 text-white/80 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="text-sm font-medium">{band.label}</span>
                  <span class="text-[0.65rem] leading-snug text-white/40">
                    {band.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator class="my-1 bg-white/10" />
        <GlassItem
          testId="tree-toolbar-focus-change-person"
          label={props.focus.personName ? "Change who I am" : "Tell us who you are"}
          onSelect={props.onChangePerson}
        >
          <UserRound />
        </GlassItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolButton(props: {
  label: string;
  shortcut?: string;
  active?: boolean;
  href?: string;
  testId?: string;
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
            data-testid={props.testId}
            onClick={props.onClick}
          >
            {props.children}
          </TooltipTrigger>
        }
      >
        <TooltipTrigger
          as={A}
          href={props.href!}
          class={classes()}
          aria-label={props.label}
          data-testid={props.testId}
        >
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
  testId?: string;
  onSelect: () => void;
  children: JSX.Element;
}) {
  return (
    <DropdownMenuItem
      class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
      data-testid={props.testId}
      onSelect={props.onSelect}
    >
      {props.children}
      {props.label}
    </DropdownMenuItem>
  );
}
