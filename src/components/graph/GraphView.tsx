import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { forceCollide, forceY } from "d3-force";
import type { TreeGraph } from "~/api/people-server";
import type { TreeRole } from "~/server/guards";
import {
  branchColor,
  buildGraphModel,
  clampToGenerationBand,
  generationRowY,
  initialsOf,
  neighborsOf,
  nodeRadius,
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
  onSelect: (id: string | null) => void;
  onFileSelect: (fileId: string) => void;
  onReady?: (handle: GraphHandle) => void;
};

export function GraphView(props: GraphViewProps) {
  let container!: HTMLDivElement;
  let graph: any;
  let resizeObserver: ResizeObserver | undefined;
  let needsFit = true;
  let previousDirection = props.generationDirection;
  let draggingNode: GraphNode | null = null;
  let dragDistance = 0;
  let dragStart = { x: 0, y: 0 };
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
    graph.linkColor(linkColor);
  }

  function hitTestNode(clientX: number, clientY: number): GraphNode | null {
    if (!graph) return null;
    const point = graph.screen2GraphCoords(clientX, clientY);
    const zoom = graph.zoom();
    const nodes = graph.graphData().nodes as GraphNode[];
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node.x == null || node.y == null) continue;
      const radius = nodeRadius(node) + 14 / zoom;
      if (node.kind === "person") {
        if (Math.hypot(point.x - node.x, point.y - node.y) <= radius) return node;
      } else {
        if (Math.abs(point.x - node.x) <= radius && Math.abs(point.y - node.y) <= radius) {
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

  function setCanvasCursor(cursor: "default" | "pointer" | "grabbing") {
    if (!container) return;
    container.style.cursor = cursor;
    const canvas = container.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas) canvas.style.cursor = cursor;
  }

  function dragMemoryForce() {
    let nodes: GraphNode[] = [];
    const force = (alpha: number) => {
      for (const node of nodes) {
        if (node.softX == null) continue;
        node.vx = (node.vx ?? 0) + (node.softX - (node.x ?? 0)) * 1.0 * alpha;
      }
    };
    (force as any).initialize = (next: GraphNode[]) => {
      nodes = next;
    };
    return force;
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
    graph.zoomToFit(650, 110);
  }

  function reset() {
    const fresh = buildGraphModel(props.data, props.showMedia, props.generationDirection);
    model = fresh;
    graph?.graphData({
      nodes: fresh.nodes,
      links: fresh.links,
    });
    graph?.d3ReheatSimulation();
    needsFit = true;
    setTimeout(() => graph?.zoomToFit(700, 110), 500);
  }

  function applyLayout(mode: "generations" | "freeform") {
    if (!graph) return;
    const direction = props.generationDirection;
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
    graph.d3Force("dragMemory", dragMemoryForce());
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
      .onEngineStop(() => {
        if (import.meta.env.DEV) (window as any).__rootsStoppedAt = Date.now();
        updateHoverAt(pointer.x, pointer.y);
        if (needsFit) {
          needsFit = false;
          setTimeout(() => fit(), 150);
        }
      })
      .warmupTicks(60)
      .cooldownTicks(120)
      .cooldownTime(2500)
      .d3AlphaDecay(0.035)
      .minZoom(0.2)
      .maxZoom(4.5)
      .enableNodeDrag(false)
      .enablePointerInteraction(false)
      .autoPauseRedraw(true);

    graph.graphData({ nodes: model.nodes, links: model.links });
    applyLayout(props.layout);
    if (import.meta.env.DEV) {
      (window as any).__rootsGraph = graph;
      (window as any).__rootsNodes = () =>
        graph.graphData().nodes.map((node: GraphNode) => ({
          id: node.id,
          kind: node.kind,
          level: node.level,
          x: node.x,
          y: node.y,
          softX: node.softX,
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
      if (draggingNode) return;
      pointer = { x: event.clientX, y: event.clientY };
      const node = hitTestNode(event.clientX, event.clientY);
      if (node) {
        event.preventDefault();
        event.stopPropagation();
        draggingNode = node;
        dragStart = { x: event.clientX, y: event.clientY };
        dragDistance = 0;
        node.fx = node.x;
        node.fy = node.y;
        setHovered(node.id);
        setCanvasCursor("grabbing");
        refreshPaint();
        return;
      }
      backgroundDown = true;
      backgroundStart = { x: event.clientX, y: event.clientY };
      dragDistance = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (draggingNode) {
        event.preventDefault();
        dragDistance += Math.hypot(
          event.clientX - dragStart.x,
          event.clientY - dragStart.y,
        );
        dragStart = { x: event.clientX, y: event.clientY };
        const point = graph.screen2GraphCoords(event.clientX, event.clientY);
        draggingNode.fx = point.x;
        draggingNode.fy = point.y;
        draggingNode.x = point.x;
        draggingNode.y = point.y;
        graph.d3ReheatSimulation();
        return;
      }
      if (backgroundDown) {
        dragDistance += Math.hypot(
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

    const releaseDrag = (select: boolean) => {
      if (!draggingNode) return;
      const node = draggingNode;
      draggingNode = null;
      node.fx = null;
      node.fy = null;
      node.softX = node.x;
      graph.d3ReheatSimulation();
      setHovered(node.id);
      setCanvasCursor("pointer");
      suppressClickUntil = Date.now() + 400;
      if (select) selectNode(node);
      dragDistance = 0;
    };

    const onPointerUp = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (draggingNode) {
        releaseDrag(dragDistance <= 6);
        return;
      }
      if (backgroundDown) {
        const wasClick = dragDistance <= 6;
        backgroundDown = false;
        dragDistance = 0;
        if (wasClick) props.onSelect(null);
        updateHoverAt(event.clientX, event.clientY);
      }
    };

    const onPointerCancel = () => {
      if (draggingNode) releaseDrag(false);
      backgroundDown = false;
      dragDistance = 0;
    };

    const onPointerLeave = () => {
      if (draggingNode || backgroundDown) return;
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
          node.softX = old.softX;
        }
      }
    } else {
      needsFit = true;
    }
    model = next;
    graph.graphData({ nodes: next.nodes, links: next.links });
    graph.d3ReheatSimulation();
  });

  createEffect(() => {
    props.layout;
    props.generationDirection;
    applyLayout(props.layout);
  });

  createEffect(() => {
    props.selectedId;
    hovered();
    paintVersion();
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

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
