import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { forceCollide, forceY } from "d3-force";
import type { TreeGraph } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import type { PresencePeer } from "~/lib/presence-protocol";
import { presenceColor } from "~/lib/presence-color";
import {
  branchColor,
  buildGraphModel,
  clampToGenerationBand,
  fileCardSize,
  generationRowY,
  initialsOf,
  neighborsOf,
  nodeRadius,
  packComponents,
  partnerGroups,
  type GenerationDirection,
  type GraphLink,
  type GraphModel,
  type GraphNode,
} from "~/lib/graph";

export type GraphHandle = {
  fit: () => void;
  reset: () => void;
  focus: (id: string) => void;
  zoomBy: (factor: number) => void;
};

type GraphViewProps = {
  data: TreeGraph;
  role: TreeRole;
  selectedId: string | null;
  showMedia: boolean;
  layout: "generations" | "freeform";
  generationDirection: GenerationDirection;
  presence?: PresencePeer[];
  selfPeerId?: string | null;
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
  let previousDirection = props.generationDirection;
  let pressedNode: GraphNode | null = null;
  let pressStart = { x: 0, y: 0 };
  let pressDistance = 0;
  let backgroundDown = false;
  let backgroundStart = { x: 0, y: 0 };
  let pointer = { x: 0, y: 0 };
  let suppressClickUntil = 0;
  let model: GraphModel = buildGraphModel(
    props.data,
    props.showMedia,
    props.generationDirection,
  );
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);
  const [paintVersion, setPaintVersion] = createSignal(0);
  const images = new Map<string, HTMLImageElement>();

  const activeId = createMemo(() => hovered() ?? props.selectedId);
  const active = createMemo(() => {
    const id = activeId();
    if (!id) return null;
    const set = neighborsOf(model.semanticLinks, id);
    for (const node of model.nodes) {
      if (node.kind !== "union") continue;
      const connectsActiveParent = node.parentIds?.some(parentId => set.has(parentId));
      const connectsActiveChild = node.childIds?.some(childId => set.has(childId));
      if (connectsActiveParent && connectsActiveChild) set.add(node.id);
    }
    return set;
  });

  const colors = {
    ink: "#f3eee3",
    bg: "#111410",
    edge: "#66735f",
    partner: "#b97c63",
    media: "#8d846c",
    parentStep: "#88937d",
  };

  function refreshPaint() {
    if (!graph) return;
    setPaintVersion(value => value + 1);
    graph.nodeCanvasObject(drawNode);
    graph.linkColor(linkColor);
  }

  function hitTestNode(clientX: number, clientY: number): GraphNode | null {
    if (!graph) return null;
    const point = graph.screen2GraphCoords(clientX, clientY);
    const zoom = graph.zoom();
    const nodes = graph.graphData().nodes as GraphNode[];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node.kind === "union") continue;
      if (node.x == null || node.y == null) continue;
      const radius = nodeRadius(node) + 14 / zoom;
      if (node.kind === "person") {
        if (Math.hypot(point.x - node.x, point.y - node.y) <= radius) return node;
      } else {
        const card = fileCardSize(node);
        if (
          Math.abs(point.x - node.x) <= card.width / 2 + 14 / zoom &&
          Math.abs(point.y - node.y) <= card.height / 2 + 14 / zoom
        ) {
          return node;
        }
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
    return fileId ? `/api/files/${fileId}/thumb` : null;
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

  function drawNode(node: GraphNode, context: CanvasRenderingContext2D, globalScale: number) {
    const radius = nodeRadius(node);
    const isActive = !active() || active()!.has(node.id);
    const isSelected = node.id === props.selectedId;
    const isHovered = node.id === hovered();
    context.save();
    context.globalAlpha = isActive ? 1 : 0.16;

    if (node.kind === "union") {
      const radius = 6;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      context.beginPath();
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
      context.fillStyle = "#8fa98f";
      context.fill();
      context.lineWidth = 1.1 / globalScale;
      context.strokeStyle = "rgba(17,20,16,0.9)";
      context.stroke();
      context.restore();
      return;
    }

    if (node.kind === "person") {
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

      const showLabel = isSelected || isHovered || globalScale > 0.88;
      if (showLabel) {
        const fontSize = 11.5 / globalScale;
        context.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        const label = node.name;
        const labelY = (node.y ?? 0) + radius + 5 / globalScale;
        context.lineWidth = 3.2 / globalScale;
        context.strokeStyle = "rgba(17,20,16,0.92)";
        context.strokeText(label, node.x ?? 0, labelY);
        context.fillStyle = colors.ink;
        context.fillText(label, node.x ?? 0, labelY);

        const years =
          node.person?.birthDate || node.person?.deathDate
            ? [node.person?.birthDate?.slice(0, 4), node.person?.deathDate?.slice(0, 4)]
                .filter(Boolean)
                .join(" - ")
            : "";
        if (years && globalScale > 1.35) {
          const small = 9.5 / globalScale;
          context.font = `400 ${small}px ui-sans-serif, system-ui, sans-serif`;
          context.fillStyle = "rgba(243,238,227,0.62)";
          context.fillText(years, node.x ?? 0, labelY + 13.5 / globalScale);
        }
      }
    } else if (node.kind === "file") {
      const card = fileCardSize(node);
      const width = card.width;
      const height = card.height;
      const x = (node.x ?? 0) - width / 2;
      const y = (node.y ?? 0) - height / 2;
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
      const card = fileCardSize(node);
      const width = card.width;
      const height = card.height;
      const x = (node.x ?? 0) - width / 2;
      const y = (node.y ?? 0) - height / 2;
      const coverUrl = node.group?.coverFileId
        ? `/api/files/${node.group.coverFileId}/thumb`
        : null;
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
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      viewers.slice(0, 4).forEach((peer, index) => {
        const gap = (5 + index * 3.5) / globalScale;
        context.beginPath();
        if (node.kind === "person") {
          context.arc(x, y, radius + gap, 0, Math.PI * 2);
        } else {
          const card = fileCardSize(node);
          const halfWidth = card.width / 2 + gap;
          const halfHeight = card.height / 2 + gap;
          context.roundRect(
            x - halfWidth,
            y - halfHeight,
            halfWidth * 2,
            halfHeight * 2,
            (6 + index * 2) / globalScale,
          );
        }
        context.lineWidth = 2.2 / globalScale;
        context.strokeStyle = presenceColor(peer.userId);
        context.stroke();
      });
    }

    context.restore();
  }

  function linkColor(link: GraphLink) {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    const set = active();
    const activeLink = !set || (set.has(source) && set.has(target));
    const base =
      link.kind === "partner"
        ? colors.partner
        : link.kind === "media"
          ? colors.media
          : link.kind === "union"
            ? "#7f8d75"
            : colors.edge;
    return withAlpha(base, activeLink ? 1 : 0.08);
  }

  function focusNode(id: string) {
    const node = graph?.graphData().nodes.find((candidate: GraphNode) => candidate.id === id);
    if (!node) return;
    graph.centerAt(node.x, node.y, 650);
    graph.zoom(Math.max(graph.zoom(), 1.65), 650);
  }

  function fit() {
    graph.zoomToFit(0, 110);
  }

  function reset() {
    const fresh = buildGraphModel(props.data, props.showMedia, props.generationDirection);
    model = fresh;
    graph?.graphData({
      nodes: fresh.nodes,
      links: fresh.links,
    });
    packComponentBands();
    snapPartnerRows();
    needsFit = true;
    setTimeout(() => graph?.zoomToFit(0, 110), 80);
  }

  function applyLayout(mode: "generations" | "freeform") {
    if (!graph) return;
    const direction = props.generationDirection;
    const linkForce = graph.d3Force("link") as any;
    if (linkForce) {
      linkForce.distance((link: GraphLink) =>
        link.kind === "partner"
          ? 165
          : link.kind === "media"
            ? 65
            : link.kind === "union"
              ? 55
              : link.viaUnion
                ? 105
                : 210,
      );
      linkForce.strength((link: GraphLink) =>
        link.kind === "union" ? 1 : link.viaUnion ? 0.9 : 0.82,
      );
    }
    const charge = graph.d3Force("charge") as any;
    if (charge) {
      charge.strength((node: GraphNode) =>
        node.kind === "union" ? -60 : node.kind === "file" ? -140 : -600,
      );
      charge.distanceMax(2400);
    }
    if (mode === "generations") {
      graph.d3Force(
        "generation",
        (forceY as any)((node: GraphNode) => {
          const row = generationRowY(node.level, direction);
          return clampToGenerationBand(node.y ?? row, node.level, direction);
        }).strength(0.5),
      );
      graph.d3Force("column", null);
    } else {
      graph.d3Force("generation", null);
      graph.d3Force("column", null);
    }
    graph.d3Force("partnerRow", partnerRowForce());
    graph.d3Force("unionPosition", unionPositionForce());
    graph.d3Force(
      "componentColumn",
      componentColumnForce(mode === "generations" ? 0.12 : 0.05),
    );
    graph.d3Force(
      "collide",
      (forceCollide as any)((node: GraphNode) =>
        nodeRadius(node) + (node.kind === "union" ? 18 : 28),
      ).strength(1),
    );
  }

  function settleLayout() {
    if (!graph) return;
    graph.warmupTicks(300);
    const data = graph.graphData();
    graph.graphData({ nodes: [...data.nodes], links: [...data.links] });
    packComponentBands();
    snapPartnerRows();
    fit();
  }

  function partnerRowForce() {
    let nodes: GraphNode[] = [];
    const force = (alpha: number) => {
      const byId = new Map(nodes.map(node => [node.id, node]));
      for (const link of model.links) {
        if (link.kind !== "partner") continue;
        const a =
          typeof link.source === "string" ? byId.get(link.source) : (link.source as GraphNode);
        const b =
          typeof link.target === "string" ? byId.get(link.target) : (link.target as GraphNode);
        if (!a || !b) continue;
        const targetY = ((a.y ?? 0) + (b.y ?? 0)) / 2;
        a.vy = (a.vy ?? 0) + (targetY - (a.y ?? 0)) * 0.9 * alpha;
        b.vy = (b.vy ?? 0) + (targetY - (b.y ?? 0)) * 0.9 * alpha;
      }
    };
    (force as any).initialize = (next: GraphNode[]) => {
      nodes = next;
    };
    return force;
  }

  function unionPositionForce() {
    let nodes: GraphNode[] = [];
    const force = (alpha: number) => {
      const byId = new Map(nodes.map(node => [node.id, node]));
      for (const node of nodes) {
        if (node.kind !== "union" || !node.parentIds?.length) continue;
        const parents = node.parentIds
          .map(id => byId.get(id))
          .filter((parent): parent is GraphNode => Boolean(parent));
        if (!parents.length) continue;
        const targetX =
          parents.reduce((sum, parent) => sum + (parent.x ?? 0), 0) / parents.length;
        const targetY =
          parents.reduce((sum, parent) => sum + (parent.y ?? 0), 0) / parents.length +
          (props.generationDirection === "oldest-top" ? 95 : -95);
        node.vx = (node.vx ?? 0) + (targetX - (node.x ?? 0)) * 0.9 * alpha;
        node.vy = (node.vy ?? 0) + (targetY - (node.y ?? 0)) * 0.9 * alpha;
      }
    };
    (force as any).initialize = (next: GraphNode[]) => {
      nodes = next;
    };
    return force;
  }

  /**
   * A gentle pull toward each disconnected component's own horizontal band.
   * Disconnected families therefore settle side by side instead of drifting
   * into the same space. Media and junction nodes follow their links.
   */
  function componentColumnForce(strength: number) {
    let nodes: GraphNode[] = [];
    const force = (alpha: number) => {
      const byNode = model.byNode;
      for (const node of nodes) {
        if (node.kind !== "person") continue;
        const component = byNode.get(node.id);
        if (!component) continue;
        node.vx = (node.vx ?? 0) + (component.centerX - (node.x ?? 0)) * strength * alpha;
      }
    };
    (force as any).initialize = (next: GraphNode[]) => {
      nodes = next;
    };
    return force;
  }

  function packComponentBands() {
    if (!graph) return;
    packComponents(graph.graphData().nodes as GraphNode[], model.components, model.byNode);
  }

  function snapPartnerRows() {
    if (!graph) return;
    const groups = partnerGroups(props.data.relationships);
    if (!groups.length) return;
    const nodes = new Map(
      (graph.graphData().nodes as GraphNode[]).map(node => [node.id, node]),
    );
    for (const group of groups) {
      const members = group
        .map(id => nodes.get(id))
        .filter((node): node is GraphNode => Boolean(node));
      if (members.length < 2) continue;
      const targetY =
        members.reduce((sum, node) => sum + (node.y ?? 0), 0) / members.length;
      for (const node of members) {
        node.y = targetY;
        node.vy = 0;
      }
    }
    graph.nodeCanvasObject(drawNode);
  }

  onMount(async () => {
    const { default: ForceGraph } = await import("force-graph");
    const ForceGraphAny = ForceGraph as any;
    graph = new ForceGraphAny(container)
      .width(container.clientWidth || window.innerWidth)
      .height(container.clientHeight || window.innerHeight)
      .backgroundColor(colors.bg)
      .nodeId("id")
      .nodeVal((node: GraphNode) => node.val)
      .nodeCanvasObject(drawNode)
      .onRenderFramePost(drawPresenceTagsLayer)
      .nodeLabel("")
      .linkColor(linkColor)
      .linkWidth((link: GraphLink) =>
        link.kind === "media" ? 0.8 : link.kind === "union" ? 0.9 : 1.25,
      )
      .linkLineDash((link: GraphLink) =>
        link.kind === "partner" ? [4, 5] : link.kind === "media" ? [2, 5] : link.parentType && link.parentType !== "biological" ? [6, 5] : null,
      )
      .linkDirectionalArrowLength((link: GraphLink) => (link.kind === "parent" ? 4 : 0))
      .linkDirectionalArrowRelPos(0.92)
      .linkDirectionalArrowColor((link: GraphLink) =>
        link.kind === "parent" ? colors.parentStep : "rgba(0,0,0,0)",
      )
      .onEngineStop(() => {
        if (import.meta.env.DEV) (window as any).__familyTreeStoppedAt = Date.now();
        packComponentBands();
        snapPartnerRows();
        updateHoverAt(pointer.x, pointer.y);
        if (needsFit) {
          needsFit = false;
          fit();
        }
      })
      .warmupTicks(300)
      .cooldownTicks(0)
      .cooldownTime(0)
      .minZoom(0.2)
      .maxZoom(4.5)
      .enableNodeDrag(false)
      .enablePointerInteraction(false)
      .autoPauseRedraw(true);

    applyLayout(props.layout);
    graph.graphData({ nodes: model.nodes, links: model.links });
    snapPartnerRows();
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
      reset,
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

    onCleanup(() => {
      resizeObserver?.disconnect();
      container.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      container.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("click", onCaptureClick, true);
      graph?._destructor?.();
      graph = undefined;
    });
  });

  createEffect(() => {
    const direction = props.generationDirection;
    const directionChanged = direction !== previousDirection;
    previousDirection = direction;
    const next = buildGraphModel(props.data, props.showMedia, direction);
    if (!graph) {
      model = next;
      return;
    }
    const previous = new Map<string, GraphNode>(
      graph.graphData().nodes.map((node: GraphNode) => [node.id, node]),
    );
    if (!directionChanged) {
      for (const node of next.nodes) {
        const old = previous.get(node.id);
        if (old) {
          node.x = old.x;
          node.y = old.y;
          node.vx = old.vx;
          node.vy = old.vy;
        }
      }
    } else {
      needsFit = true;
    }
    model = next;
    graph.graphData({ nodes: next.nodes, links: next.links });
    packComponentBands();
    snapPartnerRows();
  });

  createEffect(() => {
    props.layout;
    props.generationDirection;
    applyLayout(props.layout);
    settleLayout();
  });

  createEffect(() => {
    props.selectedId;
    hovered();
    paintVersion();
    props.presence;
    props.selfPeerId;
    if (graph) {
      graph.nodeCanvasObject(drawNode);
      graph.linkColor(linkColor);
    }
  });

  return (
    <div class="graph-shell">
      <div ref={container} class="graph-canvas" />
      <div class="graph-vignette" />
      <Show when={!ready()}>
        <div class="absolute inset-0 grid place-items-center">
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

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
