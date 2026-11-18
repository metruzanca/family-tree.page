import { A } from "@solidjs/router";
import { For, Show, type JSX } from "solid-js";
import {
  ArrowLeft,
  BookOpen,
  CalendarArrowUp,
  CalendarDays,
  History,
  Image as ImageIcon,
  ImageOff,
  Images,
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
import { FOCUS_BANDS, type FocusRadius } from "~/lib/focus";
import type { PresencePeer, PresenceStatus } from "~/lib/presence-protocol";
import type { TreeRole } from "~/server/guards";
import { roleKey } from "~/lib/format";
import { useI18n } from "~/i18n/LocaleProvider";
import type { TranslationKey } from "~/i18n";
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
  ageOrder: boolean;
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
  onToggleAgeOrder: () => void;
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

/** Focus bands carry English labels for their users; the menu reads them from the dictionary. */
const FOCUS_BAND_KEYS: Record<
  FocusRadius,
  { label: TranslationKey; description: TranslationKey }
> = {
  1: {
    label: "graph.focus.immediate.label",
    description: "graph.focus.immediate.description",
  },
  2: {
    label: "graph.focus.close.label",
    description: "graph.focus.close.description",
  },
  3: {
    label: "graph.focus.extended.label",
    description: "graph.focus.extended.description",
  },
  4: {
    label: "graph.focus.cousins.label",
    description: "graph.focus.cousins.description",
  },
  all: {
    label: "tree.everyone",
    description: "graph.focus.all.description",
  },
};

export function GraphToolbar(props: ToolbarProps) {
  const { t } = useI18n();
  const editable = () => props.role === "owner" || props.role === "editor";
  return (
    <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div class="pointer-events-auto flex items-center gap-2">
        <A
          href={props.backHref ?? "/trees"}
          class={`${glass} px-3`}
          aria-label={props.backLabel ?? t("graph.toolbar.back")}
          data-testid="tree-toolbar-back"
        >
          <ArrowLeft size={16} />
          <span class="hidden sm:inline">{props.backLabel ?? t("graph.toolbar.trees")}</span>
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
              ? t("graph.toolbar.visibleOf", {
                  visible: props.focus.visibleCount,
                  count: props.focus.total,
                })
              : t("common.person", { count: props.focus.total })}
          </span>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/10 text-[0.58rem] font-semibold uppercase tracking-wide text-white/60"
          >
            {props.badgeLabel ?? t(roleKey(props.role))}
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
            label={t("graph.toolbar.search")}
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
              aria-label={t("graph.toolbar.addPerson")}
              data-testid="tree-toolbar-add-person"
              onClick={() => props.onAddPerson?.()}
            >
              <Plus size={16} />
              <span class="hidden sm:inline">{t("graph.toolbar.addPerson")}</span>
            </button>
          </Show>
          <div class="hidden items-center gap-1.5 lg:flex">
            <ToolButton
              testId="tree-toolbar-media"
              active={props.showMedia}
              label={
                props.showMedia
                  ? t("graph.toolbar.hideMedia")
                  : t("graph.toolbar.showMedia")
              }
              onClick={props.onToggleMedia}
            >
              <Show when={props.showMedia} fallback={<ImageOff size={17} />}>
                <ImageIcon size={17} />
              </Show>
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-age-order"
              active={props.ageOrder}
              label={
                props.ageOrder
                  ? t("graph.toolbar.ageOrderOff")
                  : t("graph.toolbar.ageOrderOn")
              }
              onClick={props.onToggleAgeOrder}
            >
              <CalendarArrowUp size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-zoom-out"
              label={t("graph.toolbar.zoomOut")}
              shortcut="−"
              onClick={props.onZoomOut}
            >
              <ZoomOut size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-zoom-in"
              label={t("graph.toolbar.zoomIn")}
              shortcut="+"
              onClick={props.onZoomIn}
            >
              <ZoomIn size={17} />
            </ToolButton>
            <ToolButton
              testId="tree-toolbar-fit"
              label={t("graph.toolbar.fit")}
              shortcut="F"
              onClick={props.onFit}
            >
              <Maximize2 size={17} />
            </ToolButton>
            <Show when={props.showTreeLinks !== false}>
              <ToolButton
                testId="tree-toolbar-research"
                label={t("graph.toolbar.research")}
                href={`/trees/${props.treeId}/research`}
              >
                <BookOpen size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-gallery"
                label={t("media.title")}
                href={`/trees/${props.treeId}/media`}
              >
                <Images size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-activity"
                label={t("graph.toolbar.activity")}
                href={`/trees/${props.treeId}/activity`}
              >
                <History size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-calendar"
                label={t("trees.calendar")}
                href={`/trees/${props.treeId}/calendar`}
              >
                <CalendarDays size={17} />
              </ToolButton>
              <ToolButton
                testId="tree-toolbar-settings"
                label={t("tree.settings.title")}
                href={`/trees/${props.treeId}/settings`}
              >
                <Settings size={17} />
              </ToolButton>
            </Show>
          </div>

          <DropdownMenu placement="bottom-end">
            <DropdownMenuTrigger
              class={`${glass} px-2 lg:hidden`}
              aria-label={t("graph.toolbar.more")}
              data-testid="tree-toolbar-more"
            >
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-56 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
              <GlassItem
                testId="tree-toolbar-more-media"
                label={
                  props.showMedia
                    ? t("graph.toolbar.hideMedia")
                    : t("graph.toolbar.showMedia")
                }
                onSelect={props.onToggleMedia}
              >
                <Show when={props.showMedia} fallback={<ImageOff />}>
                  <ImageIcon />
                </Show>
              </GlassItem>
              <GlassItem
                testId="tree-toolbar-more-age-order"
                label={
                  props.ageOrder
                    ? t("graph.toolbar.ageOrderOff")
                    : t("graph.toolbar.ageOrderOn")
                }
                onSelect={props.onToggleAgeOrder}
              >
                <CalendarArrowUp />
              </GlassItem>
              <Show when={props.showFocus !== false}>
                <GlassItem
                  testId="tree-toolbar-more-focus-person"
                  label={
                    props.focus.personName
                      ? t("graph.toolbar.focusedChange", {
                          name: props.focus.personName,
                        })
                      : t("graph.toolbar.tellWho")
                  }
                  onSelect={props.onChangeFocusPerson}
                >
                  <UserRound />
                </GlassItem>
                <Show when={props.focus.radius !== "all"}>
                  <GlassItem
                    testId="tree-toolbar-more-show-all"
                    label={t("graph.toolbar.showAll")}
                    onSelect={() => props.onFocusRadius("all")}
                  >
                    <Target />
                  </GlassItem>
                </Show>
              </Show>
              <DropdownMenuSeparator class="my-1 bg-white/10" />
              <GlassItem
                testId="tree-toolbar-more-zoom-out"
                label={t("graph.toolbar.zoomOut")}
                onSelect={props.onZoomOut}
              >
                <ZoomOut />
              </GlassItem>
              <GlassItem
                testId="tree-toolbar-more-zoom-in"
                label={t("graph.toolbar.zoomIn")}
                onSelect={props.onZoomIn}
              >
                <ZoomIn />
              </GlassItem>
              <GlassItem
                testId="tree-toolbar-more-fit"
                label={t("graph.toolbar.fit")}
                onSelect={props.onFit}
              >
                <Maximize2 />
              </GlassItem>
              <Show when={props.showTreeLinks !== false}>
                <DropdownMenuSeparator class="my-1 bg-white/10" />
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/media`}
                  data-testid="tree-toolbar-more-gallery"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <Images />
                  {t("media.title")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/research`}
                  data-testid="tree-toolbar-more-research"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <BookOpen />
                  {t("graph.toolbar.research")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/activity`}
                  data-testid="tree-toolbar-more-activity"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <History />
                  {t("graph.toolbar.activity")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/calendar`}
                  data-testid="tree-toolbar-more-calendar"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <CalendarDays />
                  {t("trees.calendar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  as={A}
                  href={`/trees/${props.treeId}/settings`}
                  data-testid="tree-toolbar-more-settings"
                  class="gap-2 rounded-xl px-3 py-2 text-white/80 data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                >
                  <Settings />
                  {t("tree.settings.title")}
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
  const { t } = useI18n();
  return (
    <DropdownMenu placement="bottom-end">
      <DropdownMenuTrigger
        class={`${glass} size-10 px-0 ${
          props.focus.personName ? "!text-white" : "!text-white/55 hover:!text-white"
        }`}
        aria-label={t("graph.toolbar.focusMenu")}
        data-testid="tree-toolbar-focus"
      >
        <Target size={17} />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-72 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
        <div class="px-3 pb-1 pt-2">
          <p class="text-xs font-semibold text-white/90">
            {props.focus.personName
              ? t("graph.toolbar.focused", { name: props.focus.personName })
              : t("graph.toolbar.showingAll")}
          </p>
          <p class="mt-0.5 text-[0.7rem] text-white/45">
            {t("graph.toolbar.visibleCount", {
              visible: props.focus.visibleCount,
              count: props.focus.total,
            })}
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
                  <span class="text-sm font-medium">
                    {t(FOCUS_BAND_KEYS[band.radius].label)}
                  </span>
                  <span class="text-[0.65rem] leading-snug text-white/40">
                    {t(FOCUS_BAND_KEYS[band.radius].description)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator class="my-1 bg-white/10" />
        <GlassItem
          testId="tree-toolbar-focus-change-person"
          label={
            props.focus.personName
              ? t("graph.toolbar.changeWho")
              : t("graph.toolbar.tellWho")
          }
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
