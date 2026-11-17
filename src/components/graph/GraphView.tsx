import { forceCollide, forceLink, forceManyBody, forceY } from "d3-force";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { TreeGraph } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import type { PresencePeer } from "~/lib/presence-protocol";
import { presenceColor } from "~/lib/presence-color";
import { formatFuzzyYearRange, fuzzyOrderYear } from "~/lib/fuzzy-date";
import { cx } from "~/lib/utils";
import {
  branchColor,
  buildGraphModel,
  fileCardSize,
  initialsOf,
  neighborsOf,
  nodeRadius,
  type GraphLink,
  type GraphModel,
  type GraphNode,
} from "~/lib/graph";

/**
 * Resting length for each kind of edge. The two arms of a family junction add
 * up to roughly the old parent-child distance. Media springs stay short.
 */
const LINK_DISTANCE: Record<GraphLink["kind"], number> = {
  parent: 45,
  child: 45,
  partner: 65,
  media: 32,
};

/**
 * Birth-year gravity maps one year to a vertical offset. The band is clamped so
 * a short span does not stretch a small family apart and a long span does not
 * collapse into a thin line.
 */
const AGE_ORDER_YEARS_TO_UNITS = 12;
const AGE_ORDER_MIN_SPAN = 400;
const AGE_ORDER_MAX_SPAN = 1200;
/** Strong enough to read as a timeline, still weaker than a family link. */
const AGE_ORDER_STRENGTH = 0.3;
/** Undated people drift toward the middle band instead of one end. */
const AGE_ORDER_FALLBACK_STRENGTH = 0.05;

export type GraphHandle = {
  fit: () => void;
  focus: (id: string) => void;
  zoomBy: (factor: number) => void;
};

type GraphViewProps = {
  data: TreeGraph;
  role: TreeRole;
  selectedId: string | null;
  showMedia: boolean;
  /**
   * People to draw. Omitted or undefined draws the whole tree. Generations are
   * always computed from the full tree, so showing more relatives never
   * changes the generation of the people already on screen.
   */
  visible?: ReadonlySet<string>;
  /** Drift older people upward with a gentle birth-year gravity. */
  ageOrder: boolean;
  presence?: PresencePeer[];
  selfPeerId?: string | null;
  /** Extra classes for the graph shell, for example a fixed height when embedded. */
  class?: string;
  /** Override where thumbnails are loaded from, used by the public landing demo. */
  thumbUrlFor?: (fileId: string) => string;
  /** Padding used by zoom-to-fit. The full-screen app wants more than an embed. */
  fitPadding?: number;
  /** Optional shorter label for a node, used by the landing demo to show first names. */
  nodeLabel?: (node: GraphNode) => string;
  onSelect: (id: string | null) => void;
  onFileSelect: (fileId: string) => void;
  onGroupSelect: (groupId: string) => void;
  onReady?: (handle: GraphHandle) => void;
};

export function GraphView(props: GraphViewProps) {
  let container!: HTMLDivElement;
  let graph: any;
  let resizeObserver: ResizeObserver | undefined;
  let needsFit = true;
  let previousAgeOrder = props.ageOrder;
  let pressedNode: GraphNode | null = null;
  let pressStart = { x: 0, y: 0 };
  let pressDistance = 0;
  let backgroundDown = false;
  let backgroundStart = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0 };
  let suppressClickUntil = 0;

  const initialModel = buildGraphModel(props.data, props.showMedia, props.visible);
  const [model, setModel] = createSignal<GraphModel>(initialModel);
  let previousPersonIds = new Set(initialModel.people.map(node => node.id));
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);
  const [paintVersion, setPaintVersion] = createSignal(0);
  const mediaNodes = createMemo(() =>
    model()
      .nodes.filter(node => node.kind === "file" || node.kind === "group")
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const images = new Map<string, HTMLImageElement>();
  let disposeGraph: (() => void) | undefined;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    disposeGraph?.();
  });

  const active = createMemo(() => {
    const id = hovered() ?? props.selectedId;
    if (!id) return null;
    const node = model().byId.get(id);
    const anchor = node?.ownerId ?? id;
    const set = neighborsOf(model().links, anchor);
    // A junction is a transparent step: hovering a parent should also light up
    // the children on the far side, and the other way round.
    for (const neighbour of [...set]) {
      if (model().byId.get(neighbour)?.kind !== "junction") continue;
      for (const next of neighborsOf(model().links, neighbour)) set.add(next);
    }
    for (const peer of model().nodes) {
      if (peer.ownerId === anchor) set.add(peer.id);
    }
    return set;
  });

  const colors = {
    ink: "#f3eee3",
    bg: "#111410",
    edge: "#66735f",
    partner: "#b97c63",
  };

  function refreshPaint() {
    if (!graph) return;
    setPaintVersion(value => value + 1);
    graph.nodeCanvasObject(drawNode);
  }

  function endpointId(endpoint: string | GraphNode) {
    return typeof endpoint === "string" ? endpoint : endpoint.id;
  }

  /**
   * force-graph re-seeds every node that has no coordinates. Carry the previous
   * position over by id so a refresh, media toggle, or focus change keeps the
   * people that stay on screen where they were and only the newcomers move.
   */
  function seedPositions(target: GraphModel) {
    const current = new Map<string, GraphNode>();
    for (const node of (graph?.graphData().nodes ?? []) as GraphNode[]) {
      current.set(node.id, node);
    }
    for (const node of target.nodes) {
      const previous = current.get(node.id);
      if (!previous) continue;
      node.x = previous.x;
      node.y = previous.y;
      node.vx = previous.vx;
      node.vy = previous.vy;
    }
  }

  function hitTestNode(clientX: number, clientY: number): GraphNode | null {
    if (!graph) return null;
    const rect = container.getBoundingClientRect();
    const point = graph.screen2GraphCoords(clientX - rect.left, clientY - rect.top);
    const zoom = graph.zoom();
    const nodes = graph.graphData().nodes as GraphNode[];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node.kind !== "person") continue;
      if (node.x == null || node.y == null) continue;
      const radius = nodeRadius(node) + 14 / zoom;
      if (Math.hypot(point.x - node.x, point.y - node.y) <= radius) return node;
    }
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node.kind === "person" || node.kind === "junction") continue;
      if (node.x == null || node.y == null) continue;
      const card = fileCardSize(node);
      if (
        Math.abs(point.x - node.x) <= card.width / 2 + 14 / zoom &&
        Math.abs(point.y - node.y) <= card.height / 2 + 14 / zoom
      ) {
        return node;
      }
    }
    return null;
  }

  function updateHoverAt(clientX: number, clientY: number) {
    const node = hitTestNode(clientX, clientY);
    const next = node?.id ?? null;
    setCanvasCursor(node ? "pointer" : "default");
    if (next !== hovered()) {
      setHovered(next);
      refreshPaint();
    }
  }

  function selectNode(node: GraphNode) {
    // The panel can render directly under the pointer on mobile. Suppress the
    // synthetic click so it cannot land on a button in the newly opened panel.
    suppressClickUntil = Date.now() + 400;
    if (node.kind === "person") {
      props.onSelect(node.id);
    } else if (node.kind === "group" && node.group) {
      props.onGroupSelect(node.group.id);
    } else if (node.file) {
      props.onFileSelect(node.file.id);
    }
  }

  function imageFor(url: string) {
    const existing = images.get(url);
    if (existing) return existing;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    image.onload = () => refreshPaint();
    images.set(url, image);
    return image;
  }

  function avatarUrl(fileId: string | null | undefined) {
    if (!fileId) return null;
    return props.thumbUrlFor ? props.thumbUrlFor(fileId) : `/api/files/${fileId}/thumb`;
  }

  function setCanvasCursor(cursor: "default" | "pointer") {
    if (!container) return;
    container.style.cursor = cursor;
    const canvas = container.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas) canvas.style.cursor = cursor;
  }

  function shortPresenceName(displayName: string) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) {
      return parts[0].length > 16 ? `${parts[0].slice(0, 15)}…` : parts[0];
    }
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
  }

  function drawPresenceTagStack(
    node: GraphNode,
    viewers: PresencePeer[],
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    if (!viewers.length) return;
    const shown = viewers.slice(0, 3);
    const remaining = viewers.length - shown.length;

    const card = node.kind === "person" ? null : fileCardSize(node);
    const radius = nodeRadius(node);
    const edgeX = (card ? card.width / 2 : radius) + 7 / globalScale;
    const edgeY = card ? card.height / 2 : radius;
    const fontSize = 9.5 / globalScale;
    const dotRadius = 2.6 / globalScale;
    const padX = 5 / globalScale;
    const padY = 3 / globalScale;
    const rowGap = 2.5 / globalScale;
    const rowHeight = fontSize + padY * 2;

    const rows = shown.map(peer => ({
      text: shortPresenceName(peer.displayName),
      color: presenceColor(peer.userId),
    }));
    if (remaining > 0) rows.push({ text: `+${remaining}`, color: "#8d846c" });

    const x = (node.x ?? 0) + edgeX;
    const totalHeight = rows.length * rowHeight + (rows.length - 1) * rowGap;
    let y = (node.y ?? 0) - edgeY - 6 / globalScale - totalHeight;

    context.save();
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    for (const row of rows) {
      const textWidth = context.measureText(row.text).width;
      const width = padX * 2 + dotRadius * 2 + 3 / globalScale + textWidth;
      context.beginPath();
      context.roundRect(x, y, width, rowHeight, rowHeight / 2);
      context.fillStyle = "rgba(17,20,16,0.86)";
      context.fill();
      context.lineWidth = 1 / globalScale;
      context.strokeStyle = row.color;
      context.stroke();

      context.beginPath();
      context.arc(x + padX + dotRadius, y + rowHeight / 2, dotRadius, 0, Math.PI * 2);
      context.fillStyle = row.color;
      context.fill();

      context.fillStyle = "#f3eee3";
      context.fillText(
        row.text,
        x + padX + dotRadius * 2 + 3 / globalScale,
        y + rowHeight / 2 + 0.4 / globalScale,
      );
      y += rowHeight + rowGap;
    }
    context.restore();
  }

  /**
   * Tags render after every node so a nearby node or file card cannot cover
   * them. Crossws peer ids change on reconnect, so dedupe by user per node.
   */
  function drawPresenceTagsLayer(
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    const peers = props.presence;
    if (!peers?.length || !graph) return;
    const nodes = new Map<string, GraphNode>();
    for (const node of graph.graphData().nodes as GraphNode[]) nodes.set(node.id, node);

    const groups = new Map<string, PresencePeer[]>();
    const seen = new Map<string, Set<string>>();
    for (const peer of peers) {
      if (!peer.nodeId || peer.peerId === props.selfPeerId || !nodes.has(peer.nodeId)) continue;
      let users = seen.get(peer.nodeId);
      if (!users) {
        users = new Set();
        seen.set(peer.nodeId, users);
      }
      if (users.has(peer.userId)) continue;
      users.add(peer.userId);
      const viewers = groups.get(peer.nodeId) ?? [];
      viewers.push(peer);
      groups.set(peer.nodeId, viewers);
    }

    for (const [nodeId, viewers] of groups) {
      const node = nodes.get(nodeId);
      if (node) drawPresenceTagStack(node, viewers, context, globalScale);
    }
  }

  function drawPerson(
    node: GraphNode,
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    const radius = nodeRadius(node);
    const isActive = !active() || active()!.has(node.id);
    const isSelected = node.id === props.selectedId;
    const isHovered = node.id === hovered();
    context.save();
    context.globalAlpha = isActive ? 1 : 0.16;

    if (isSelected || isHovered) {
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radius + 6 / globalScale, 0, Math.PI * 2);
      context.fillStyle = isSelected ? "rgba(196,154,69,0.22)" : "rgba(243,238,227,0.12)";
      context.fill();
    }

    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
    context.closePath();
    context.fillStyle = "#1b2118";
    context.fill();

    const url = avatarUrl(node.person?.avatarFileId);
    const image = url ? imageFor(url) : null;
    if (image?.complete && image.naturalWidth > 0) {
      context.save();
      context.clip();
      drawImageCropped(
        context,
        image,
        (node.x ?? 0) - radius,
        (node.y ?? 0) - radius,
        radius * 2,
        radius * 2,
      );
      context.restore();
    } else {
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
      context.fillStyle = branchColor(node.person?.lastName || node.person?.firstName || node.name);
      context.fill();
      context.fillStyle = "#131810";
      context.font = `600 ${Math.max(7, radius * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(initialsOf(node.name), node.x ?? 0, (node.y ?? 0) + 0.5);
    }

    context.beginPath();
    context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
    context.lineWidth = (isSelected ? 2.6 : isHovered ? 2 : 1.1) / globalScale;
    context.strokeStyle = isSelected ? "#e3bb68" : isHovered ? "#f3eee3" : "#0b0e0a";
    context.stroke();

    const showLabel = isSelected || isHovered || globalScale > 0.7;
    if (showLabel) {
      const fontSize = 10.5 / globalScale;
      context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "top";
      const label = props.nodeLabel ? props.nodeLabel(node) : node.name;
      const labelY = (node.y ?? 0) + radius + 5 / globalScale;
      context.lineWidth = 3.2 / globalScale;
      context.strokeStyle = "rgba(17,20,16,0.92)";
      context.strokeText(label, node.x ?? 0, labelY);
      context.fillStyle = colors.ink;
      context.fillText(label, node.x ?? 0, labelY);

      const years = node.person
        ? formatFuzzyYearRange(node.person.birthDate, node.person.deathDate)
        : "";
      if (years && globalScale > 1.35) {
        const small = 9.5 / globalScale;
        context.font = `400 ${small}px ui-sans-serif, system-ui, sans-serif`;
        context.fillStyle = "rgba(243,238,227,0.62)";
        context.fillText(years, node.x ?? 0, labelY + 13.5 / globalScale);
      }
    }

    const viewers = props.presence?.filter(
      peer => peer.nodeId === node.id && peer.peerId !== props.selfPeerId,
    );
    if (viewers?.length) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      viewers.slice(0, 4).forEach((peer, index) => {
        const gap = (5 + index * 3.5) / globalScale;
        context.beginPath();
        context.arc(x, y, radius + gap, 0, Math.PI * 2);
        context.lineWidth = 2.2 / globalScale;
        context.strokeStyle = presenceColor(peer.userId);
        context.stroke();
      });
    }

    context.restore();
  }

  function drawMediaCard(
    node: GraphNode,
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    const isSelected = node.id === props.selectedId;
    const isHovered = node.id === hovered();
    const isActive = !active() || (node.ownerId ? active()!.has(node.ownerId) : false);
    context.save();
    context.globalAlpha = isActive ? 1 : 0.12;

    const card = fileCardSize(node);
    const width = card.width;
    const height = card.height;
    const x = (node.x ?? 0) - width / 2;
    const y = (node.y ?? 0) - height / 2;

    if (node.kind === "file") {
      const url = node.file?.thumbUrl ? node.file.thumbUrl : null;
      const image = url ? imageFor(url) : null;
      const hasImage = Boolean(image?.complete && image.naturalWidth > 0);

      context.beginPath();
      context.roundRect(x, y, width, height, 5 / globalScale);
      context.fillStyle = hasImage ? "#20261d" : "#2b3027";
      context.fill();

      if (image && hasImage) {
        context.save();
        context.clip();
        drawImageCropped(context, image, x, y, width, height);
        context.restore();
      } else {
        context.strokeStyle = "#c49a45";
        context.lineWidth = 1.2 / globalScale;
        context.strokeRect(
          x + width * 0.28,
          y + height * 0.2,
          width * 0.44,
          height * 0.58,
        );
        context.beginPath();
        context.moveTo(x + width * 0.36, y + height * 0.34);
        context.lineTo(x + width * 0.48, y + height * 0.46);
        context.lineTo(x + width * 0.6, y + height * 0.34);
        context.stroke();
      }

      context.beginPath();
      context.roundRect(x, y, width, height, 5 / globalScale);
      context.lineWidth = (isSelected ? 2.2 : 1) / globalScale;
      context.strokeStyle = isSelected ? "#e3bb68" : "rgba(243,238,227,0.28)";
      context.stroke();

      if (globalScale > 1.65 || isSelected || isHovered) {
        const fontSize = 9.5 / globalScale;
        const labelY = y + height + 4 / globalScale;
        context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.lineWidth = 2.8 / globalScale;
        context.strokeStyle = "rgba(17,20,16,0.92)";
        context.strokeText(node.name, node.x ?? 0, labelY);
        context.fillStyle = "rgba(243,238,227,0.82)";
        context.fillText(node.name, node.x ?? 0, labelY);
      }
    } else if (node.kind === "group") {
      const coverUrl = node.group?.coverFileId ? avatarUrl(node.group.coverFileId) : null;
      const image = coverUrl ? imageFor(coverUrl) : null;
      const hasCover = Boolean(image?.complete && image.naturalWidth > 0);

      context.beginPath();
      context.roundRect(x - 6, y - 6, width, height, 6 / globalScale);
      context.fillStyle = "#20261d";
      context.fill();
      context.lineWidth = 1 / globalScale;
      context.strokeStyle = "rgba(243,238,227,0.18)";
      context.stroke();

      context.beginPath();
      context.roundRect(x - 3, y - 3, width, height, 6 / globalScale);
      context.fillStyle = "#283026";
      context.fill();
      context.stroke();

      context.beginPath();
      context.roundRect(x, y, width, height, 6 / globalScale);
      context.fillStyle = hasCover ? "#20261d" : "#2b3027";
      context.fill();

      if (image && hasCover) {
        context.save();
        context.clip();
        drawImageCropped(context, image, x, y, width, height);
        context.restore();
      } else {
        context.strokeStyle = "#c49a45";
        context.lineWidth = 1.2 / globalScale;
        for (let index = 0; index < 3; index += 1) {
          context.strokeRect(
            x + width * 0.24,
            y + height * (0.2 + index * 0.2),
            width * 0.52,
            height * 0.1,
          );
        }
      }

      context.beginPath();
      context.roundRect(x, y, width, height, 6 / globalScale);
      context.lineWidth = (isSelected ? 2.2 : 1.1) / globalScale;
      context.strokeStyle = isSelected ? "#e3bb68" : "rgba(243,238,227,0.4)";
      context.stroke();

      const count = node.group?.count ?? 0;
      if (count > 1) {
        const badgeRadius = 9 / globalScale;
        const badgeX = x + width - 2 / globalScale;
        const badgeY = y + height - 2 / globalScale;
        context.beginPath();
        context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        context.fillStyle = "#c49a45";
        context.fill();
        context.fillStyle = "#161a12";
        context.font = `700 ${10 / globalScale}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(count), badgeX, badgeY + 0.5);
      }

      if (globalScale > 1.2 || isSelected || isHovered) {
        const fontSize = 10 / globalScale;
        const labelY = y + height + 5 / globalScale;
        context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.lineWidth = 2.8 / globalScale;
        context.strokeStyle = "rgba(17,20,16,0.92)";
        context.strokeText(node.name, node.x ?? 0, labelY);
        context.fillStyle = "rgba(243,238,227,0.9)";
        context.fillText(node.name, node.x ?? 0, labelY);
      }
    }

    const viewers = props.presence?.filter(
      peer => peer.nodeId === node.id && peer.peerId !== props.selfPeerId,
    );
    if (viewers?.length) {
      const xCenter = node.x ?? 0;
      const yCenter = node.y ?? 0;
      viewers.slice(0, 4).forEach((peer, index) => {
        const gap = (5 + index * 3.5) / globalScale;
        const halfWidth = width / 2 + gap;
        const halfHeight = height / 2 + gap;
        context.beginPath();
        context.roundRect(
          xCenter - halfWidth,
          yCenter - halfHeight,
          halfWidth * 2,
          halfHeight * 2,
          (6 + index * 2) / globalScale,
        );
        context.lineWidth = 2.2 / globalScale;
        context.strokeStyle = presenceColor(peer.userId);
        context.stroke();
      });
    }

    context.restore();
  }

  function drawNode(
    node: GraphNode,
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    if (node.kind !== "person") return;
    drawPerson(node, context, globalScale);
  }

  function linkIsActive(link: GraphLink) {
    const set = active();
    if (!set) return true;
    return set.has(endpointId(link.source)) || set.has(endpointId(link.target));
  }

  function linkColorFor(link: GraphLink) {
    if (link.kind === "media") return "rgba(0,0,0,0)";
    if (!linkIsActive(link)) return "rgba(102,115,95,0.12)";
    return link.kind === "partner" ? colors.partner : colors.edge;
  }

  function linkWidthFor(link: GraphLink) {
    return link.kind === "partner" ? 1.25 : 1.15;
  }

  function linkDashFor(link: GraphLink) {
    if (link.kind === "partner") return [4, 5];
    if (
      link.kind === "parent" &&
      link.parentType &&
      link.parentType !== "biological"
    ) {
      return [6, 5];
    }
    return null;
  }

  /**
   * Nodes collide on their painted extent, but a person also owns the label
   * under their circle. Reserving half the label width keeps two neighbours
   * from writing their names over each other once the simulation settles.
   */
  function collisionRadius(node: GraphNode) {
    if (node.kind === "junction") return 8;
    const radius = nodeRadius(node);
    if (node.kind !== "person") return radius + 14;
    const label = props.nodeLabel ? props.nodeLabel(node) : node.name;
    const labelWidth = Math.min(240, label.length * 7.2 + 16);
    return Math.max(radius + 14, labelWidth / 2 + 10);
  }

  function ageYear(node: GraphNode) {
    if (node.kind !== "person") return null;
    return fuzzyOrderYear(node.person?.birthDate);
  }

  /**
   * Birth-year gravity is a soft pull, not a pinned row. The band is computed
   * from the whole tree so focusing a branch never rescales the people who
   * are left on screen, and anyone without a birth year keeps strength zero.
   */
  function applyAgeOrder(tree: TreeGraph, enabled: boolean) {
    if (!graph) return;
    if (!enabled) {
      graph.d3Force("y", null);
      return;
    }
    const years = tree.people
      .map(person => fuzzyOrderYear(person.birthDate))
      .filter((year): year is number => year !== null);
    if (!years.length) {
      graph.d3Force("y", null);
      return;
    }
    const min = Math.min(...years);
    const max = Math.max(...years);
    const span = max - min;
    if (span <= 0) {
      graph.d3Force("y", null);
      return;
    }
    const band = Math.min(
      AGE_ORDER_MAX_SPAN,
      Math.max(AGE_ORDER_MIN_SPAN, span * AGE_ORDER_YEARS_TO_UNITS),
    );
    graph.d3Force(
      "y",
      forceY<GraphNode>(node => {
        const year = ageYear(node);
        if (year === null) return 0;
        return ((year - min) / span - 0.5) * band;
      }).strength(node => {
        if (node.kind !== "person") return 0;
        return ageYear(node) === null
          ? AGE_ORDER_FALLBACK_STRENGTH
          : AGE_ORDER_STRENGTH;
      }),
    );
  }

  function drawMediaLayer(
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    if (!graph) return;
    const width = context.canvas.clientWidth;
    const height = context.canvas.clientHeight;
    for (const node of mediaNodes()) {
      const card = fileCardSize(node);
      const screen = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
      const margin = 40 + Math.max(card.width, card.height);
      if (
        screen.x < -margin ||
        screen.x > width + margin ||
        screen.y < -margin ||
        screen.y > height + margin
      ) {
        continue;
      }
      drawMediaCard(node, context, globalScale);
    }
  }

  function drawBackground(
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    drawMediaLayer(context, globalScale);
  }

  function focusNode(id: string) {
    const node = graph?.graphData().nodes.find((candidate: GraphNode) => candidate.id === id);
    if (!node) return;
    graph.centerAt(node.x, node.y, 650);
    graph.zoom(Math.max(graph.zoom(), 1.65), 650);
  }

  function fit() {
    graph.zoomToFit(
      0,
      props.fitPadding ?? 110,
      (node: GraphNode) => node.kind === "person",
    );
  }

  function syncGraph(target: GraphModel) {
    if (!graph) return;
    seedPositions(target);
    graph.graphData({ nodes: target.nodes, links: target.links });
  }

  onMount(async () => {
    const { default: ForceGraph } = await import("force-graph");
    if (disposed) return;
    const ForceGraphAny = ForceGraph as any;
    graph = new ForceGraphAny(container)
      .width(container.clientWidth || window.innerWidth)
      .height(container.clientHeight || window.innerHeight)
      .backgroundColor(colors.bg)
      .nodeId("id")
      .nodeCanvasObject(drawNode)
      .onRenderFramePre(drawBackground)
      .onRenderFramePost(drawPresenceTagsLayer)
      .nodeLabel("")
      .onEngineStop(() => {
        if (import.meta.env.DEV) (window as any).__familyTreeStoppedAt = Date.now();
        updateHoverAt(pointer.x, pointer.y);
        if (needsFit) {
          needsFit = false;
          fit();
        }
      })
      .linkColor(linkColorFor)
      .linkWidth(linkWidthFor)
      .linkLineDash(linkDashFor)
      .linkVisibility((link: GraphLink) => link.kind !== "media")
      .warmupTicks(60)
      .d3AlphaDecay(0.035)
      .d3VelocityDecay(0.4)
      .cooldownTime(6000)
      .minZoom(0.2)
      .maxZoom(4.5)
      .enableNodeDrag(false)
      .enablePointerInteraction(false)
      .autoPauseRedraw(true);

    graph
      .d3Force(
        "charge",
        forceManyBody<GraphNode>()
          .strength(node => (node.kind === "junction" ? -40 : -260))
          .distanceMax(1200),
      )
      .d3Force(
        "link",
        forceLink<GraphNode, GraphLink>()
          .id(node => node.id)
          .distance(link => LINK_DISTANCE[link.kind])
          .strength(link =>
            link.kind === "partner" ? 0.8 : link.kind === "media" ? 1 : 1,
          ),
      )
      .d3Force(
        "collide",
        forceCollide<GraphNode>(collisionRadius).iterations(2),
      );

    applyAgeOrder(props.data, props.ageOrder);
    syncGraph(model());
    if (import.meta.env.DEV) {
      (window as any).__familyTreeGraph = graph;
      (window as any).__familyTreeNodes = () =>
        graph.graphData().nodes.map((node: GraphNode) => ({
          id: node.id,
          kind: node.kind,
          level: node.level,
          x: node.x,
          y: node.y,
        }));
    }
    setReady(true);
    props.onReady?.({
      fit,
      focus: focusNode,
      zoomBy: factor => graph.zoom(graph.zoom() * factor, 300),
    });

    resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || !graph) return;
      graph.width(rect.width).height(rect.height);
    });
    resizeObserver.observe(container);

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (pressedNode) return;
      pointer = { x: event.clientX, y: event.clientY };
      const node = hitTestNode(event.clientX, event.clientY);
      if (node) {
        event.preventDefault();
        event.stopPropagation();
        pressedNode = node;
        pressStart = { x: event.clientX, y: event.clientY };
        pressDistance = 0;
        setHovered(node.id);
        setCanvasCursor("pointer");
        refreshPaint();
        return;
      }
      backgroundDown = true;
      backgroundStart = { x: event.clientX, y: event.clientY };
      pressDistance = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (pressedNode) {
        pressDistance += Math.hypot(
          event.clientX - pressStart.x,
          event.clientY - pressStart.y,
        );
        pressStart = { x: event.clientX, y: event.clientY };
        return;
      }
      if (backgroundDown) {
        pressDistance += Math.hypot(
          event.clientX - backgroundStart.x,
          event.clientY - backgroundStart.y,
        );
        backgroundStart = { x: event.clientX, y: event.clientY };
        return;
      }
      if (container.contains(event.target as Node)) {
        updateHoverAt(event.clientX, event.clientY);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (pressedNode) {
        const node = pressedNode;
        pressedNode = null;
        const wasClick = pressDistance <= 6;
        pressDistance = 0;
        setCanvasCursor("pointer");
        if (wasClick) selectNode(node);
        return;
      }
      if (backgroundDown) {
        const wasClick = pressDistance <= 6;
        backgroundDown = false;
        pressDistance = 0;
        if (wasClick) props.onSelect(null);
        updateHoverAt(event.clientX, event.clientY);
      }
    };

    const onPointerCancel = () => {
      pressedNode = null;
      backgroundDown = false;
      pressDistance = 0;
    };

    const onPointerLeave = () => {
      if (pressedNode || backgroundDown) return;
      setHovered(null);
      setCanvasCursor("default");
      refreshPaint();
    };

    const onCaptureClick = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = 0;
      }
    };

    container.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    container.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("click", onCaptureClick, true);

    disposeGraph = () => {
      resizeObserver?.disconnect();
      container.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("click", onCaptureClick, true);
      graph?._destructor?.();
      graph = undefined;
    };
  });

  createEffect(() => {
    const enabled = props.ageOrder;
    const tree = props.data;
    const toggled = enabled !== previousAgeOrder;
    previousAgeOrder = enabled;
    if (!graph) return;
    applyAgeOrder(tree, enabled);
    if (toggled) {
      needsFit = true;
      graph.d3ReheatSimulation();
    }
  });

  createEffect(() => {
    const nextModel = buildGraphModel(props.data, props.showMedia, props.visible);
    const nextPersonIds = new Set(nextModel.people.map(node => node.id));
    const peopleChanged =
      nextPersonIds.size !== previousPersonIds.size ||
      [...nextPersonIds].some(id => !previousPersonIds.has(id));
    previousPersonIds = nextPersonIds;
    setModel(nextModel);
    syncGraph(nextModel);
    if (peopleChanged) needsFit = true;
  });

  createEffect(() => {
    props.selectedId;
    hovered();
    paintVersion();
    props.presence;
    props.selfPeerId;
    model();
    if (graph) graph.nodeCanvasObject(drawNode);
  });

  return (
    <div class={cx("graph-shell", props.class)} data-testid="tree-graph">
      <div ref={container} class="graph-canvas" data-testid="tree-graph-canvas" />
      <div class="graph-vignette" />
      <Show when={!ready()}>
        <div class="absolute inset-0 grid place-items-center" data-testid="tree-graph-loading">
          <div class="flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/60 backdrop-blur">
            <span class="h-2 w-2 animate-pulse rounded-full bg-gold" />
            Drawing the branches…
          </div>
        </div>
      </Show>
    </div>
  );
}

/**
 * Draw an image into a box without stretching it. When the box aspect differs
 * from the source, the longer side is center cropped, the same way the DOM
 * avatars and thumbnails crop with object-fit: cover.
 */
function drawImageCropped(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const targetAspect = width / height;
  const sourceAspect = sourceWidth / sourceHeight;
  let sx = 0;
  let sy = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    sx = (sourceWidth - cropWidth) / 2;
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect;
    sy = (sourceHeight - cropHeight) / 2;
  }
  context.drawImage(image, sx, sy, cropWidth, cropHeight, x, y, width, height);
}
