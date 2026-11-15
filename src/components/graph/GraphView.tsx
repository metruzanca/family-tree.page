import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { forceCollide, forceX, forceY } from "d3-force";
import type { TreeGraph } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import {
  branchColor,
  buildGraphModel,
  fileNodeId,
  initialsOf,
  neighborsOf,
  nodeRadius,
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
  onSelect: (id: string | null) => void;
  onFileOpen: (fileId: string) => void;
  onReady?: (handle: GraphHandle) => void;
};

export function GraphView(props: GraphViewProps) {
  let container!: HTMLDivElement;
  let graph: any;
  let resizeObserver: ResizeObserver | undefined;
  let needsFit = true;
  let model: GraphModel = buildGraphModel(props.data, props.showMedia);
  const [hovered, setHovered] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);
  const [paintVersion, setPaintVersion] = createSignal(0);
  const images = new Map<string, HTMLImageElement>();

  const activeId = createMemo(() => hovered() ?? props.selectedId);
  const active = createMemo(() => {
    const id = activeId();
    return id ? neighborsOf(model.links, id) : null;
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
    graph.nodePointerAreaPaint(drawPointerArea);
    graph.linkColor(linkColor);
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

  function drawNode(node: GraphNode, context: CanvasRenderingContext2D, globalScale: number) {
    const radius = nodeRadius(node);
    const isActive = !active() || active()!.has(node.id);
    const isSelected = node.id === props.selectedId;
    const isHovered = node.id === hovered();
    context.save();
    context.globalAlpha = isActive ? 1 : 0.16;

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
        context.drawImage(
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

      const showLabel = isSelected || isHovered || globalScale > 1.02;
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
    } else {
      const size = radius * 2;
      const x = (node.x ?? 0) - radius;
      const y = (node.y ?? 0) - radius;
      const url = node.file?.thumbUrl ? node.file.thumbUrl : null;
      const image = url ? imageFor(url) : null;

      context.beginPath();
      context.roundRect(x, y, size, size, 5 / globalScale);
      context.fillStyle = image?.complete && image.naturalWidth > 0 ? "#20261d" : "#2b3027";
      context.fill();

      if (image?.complete && image.naturalWidth > 0) {
        context.save();
        context.clip();
        context.drawImage(image, x, y, size, size);
        context.restore();
      } else {
        context.strokeStyle = "#c49a45";
        context.lineWidth = 1.2 / globalScale;
        context.strokeRect(x + size * 0.28, y + size * 0.2, size * 0.44, size * 0.58);
        context.beginPath();
        context.moveTo(x + size * 0.36, y + size * 0.34);
        context.lineTo(x + size * 0.48, y + size * 0.46);
        context.lineTo(x + size * 0.6, y + size * 0.34);
        context.stroke();
      }

      context.beginPath();
      context.roundRect(x, y, size, size, 5 / globalScale);
      context.lineWidth = (isSelected ? 2.2 : 1) / globalScale;
      context.strokeStyle = isSelected ? "#e3bb68" : "rgba(243,238,227,0.28)";
      context.stroke();

      if (globalScale > 1.65 || isSelected || isHovered) {
        const fontSize = 9.5 / globalScale;
        context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.lineWidth = 2.8 / globalScale;
        context.strokeStyle = "rgba(17,20,16,0.92)";
        context.strokeText(node.name, node.x ?? 0, (node.y ?? 0) + radius + 4 / globalScale);
        context.fillStyle = "rgba(243,238,227,0.82)";
        context.fillText(node.name, node.x ?? 0, (node.y ?? 0) + radius + 4 / globalScale);
      }
    }
    context.restore();
  }

  function drawPointerArea(
    node: GraphNode,
    paintColor: string,
    context: CanvasRenderingContext2D,
    globalScale: number,
  ) {
    const radius = nodeRadius(node) + 7 / globalScale;
    context.fillStyle = paintColor;
    if (node.kind === "person") {
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
      context.fill();
    } else {
      const size = radius * 2;
      context.fillRect((node.x ?? 0) - radius, (node.y ?? 0) - radius, size, size);
    }
  }

  function linkConnected(link: GraphLink, id: string) {
    const source = typeof link.source === "string" ? link.source : link.source.id;
    const target = typeof link.target === "string" ? link.target : link.target.id;
    return source === id || target === id;
  }

  function linkColor(link: GraphLink) {
    const id = activeId();
    const dim = id && !linkConnected(link, id);
    const alpha = dim ? 0.08 : 1;
    const base =
      link.kind === "partner"
        ? colors.partner
        : link.kind === "media"
          ? colors.media
          : colors.edge;
    return withAlpha(base, alpha);
  }

  function focusNode(id: string) {
    const node = graph?.graphData().nodes.find((candidate: GraphNode) => candidate.id === id);
    if (!node) return;
    graph.centerAt(node.x, node.y, 650);
    graph.zoom(Math.max(graph.zoom(), 1.65), 650);
  }

  function fit() {
    graph.zoomToFit(650, 90);
  }

  function reset() {
    const fresh = buildGraphModel(props.data, props.showMedia);
    model = fresh;
    graph?.graphData({
      nodes: fresh.nodes,
      links: fresh.links,
    });
    graph?.d3ReheatSimulation();
    setTimeout(() => graph?.zoomToFit(700, 90), 500);
  }

  function applyLayout(mode: "generations" | "freeform") {
    if (!graph) return;
    const linkForce = graph.d3Force("link") as any;
    if (linkForce) {
      linkForce.distance((link: GraphLink) =>
        link.kind === "partner" ? 105 : link.kind === "media" ? 58 : 150,
      );
      linkForce.strength(0.78);
    }
    const charge = graph.d3Force("charge") as any;
    if (charge) {
      charge.strength(-280);
      charge.distanceMax(1600);
    }
    if (mode === "generations") {
      graph.d3Force("generation", (forceY as any)((node: GraphNode) => node.level * 190).strength(0.28));
      graph.d3Force("column", (forceX as any)(0).strength(0.008));
    } else {
      graph.d3Force("generation", null);
      graph.d3Force("column", null);
    }
    graph.d3Force(
      "collide",
      (forceCollide as any)((node: GraphNode) => nodeRadius(node) + 12).strength(0.95),
    );
    graph.d3ReheatSimulation();
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
      .nodePointerAreaPaint(drawPointerArea)
      .nodeLabel("")
      .linkColor(linkColor)
      .linkWidth((link: GraphLink) => (link.kind === "media" ? 0.8 : 1.25))
      .linkLineDash((link: GraphLink) =>
        link.kind === "partner" ? [4, 5] : link.kind === "media" ? [2, 5] : link.parentType && link.parentType !== "biological" ? [6, 5] : null,
      )
      .linkDirectionalArrowLength((link: GraphLink) => (link.kind === "parent" ? 4 : 0))
      .linkDirectionalArrowRelPos(0.92)
      .linkDirectionalArrowColor((link: GraphLink) =>
        link.kind === "parent" ? colors.parentStep : "rgba(0,0,0,0)",
      )
      .onNodeHover((node: GraphNode | null) => {
        setHovered(node?.id ?? null);
        refreshPaint();
      })
      .onNodeClick((node: GraphNode) => {
        if (node.kind === "person") {
          props.onSelect(node.id);
        } else if (node.file) {
          props.onFileOpen(node.file.id);
        }
      })
      .onBackgroundClick(() => props.onSelect(null))
      .onEngineStop(() => {
        if (needsFit) {
          needsFit = false;
          setTimeout(() => fit(), 150);
        }
      })
      .warmupTicks(25)
      .cooldownTicks(220)
      .cooldownTime(9000)
      .minZoom(0.2)
      .maxZoom(4.5)
      .enableNodeDrag(true)
      .autoPauseRedraw(true);

    graph.graphData({ nodes: model.nodes, links: model.links });
    applyLayout(props.layout);
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
    onCleanup(() => {
      resizeObserver?.disconnect();
      graph?._destructor?.();
      graph = undefined;
    });
  });

  createEffect(() => {
    const next = buildGraphModel(props.data, props.showMedia);
    if (!graph) {
      model = next;
      return;
    }
    const previous = new Map<string, GraphNode>(
      graph.graphData().nodes.map((node: GraphNode) => [node.id, node]),
    );
    for (const node of next.nodes) {
      const old = previous.get(node.id);
      if (old) {
        node.x = old.x;
        node.y = old.y;
        node.vx = old.vx;
        node.vy = old.vy;
      }
    }
    model = next;
    graph.graphData({ nodes: next.nodes, links: next.links });
    graph.d3ReheatSimulation();
  });

  createEffect(() => {
    props.layout;
    applyLayout(props.layout);
  });

  createEffect(() => {
    props.selectedId;
    hovered();
    paintVersion();
    if (graph) {
      graph.nodeCanvasObject(drawNode);
      graph.nodePointerAreaPaint(drawPointerArea);
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

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
