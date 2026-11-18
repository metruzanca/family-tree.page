import { fuzzyOrderYear } from "./fuzzy-date";
import {
  nodeIdOf,
  nodeRadius,
  type GraphLink,
  type GraphModel,
  type GraphNode,
} from "./graph";

export type Point = { x: number; y: number };
export type Circle = { x: number; y: number; radius: number };

/**
 * A link stops this far from the circles it really connects. Close enough to
 * read as attached, far enough that the anti-aliased line does not smear into
 * the avatar.
 */
export const ENDPOINT_GAP = 2.5;

/**
 * Clearance kept around a person the link does not belong to. A line that
 * crosses that corridor is cut, so it never looks like it ends at the person.
 */
export const PASS_THROUGH_PAD = 8;

/** Junctions are smaller than people, so their corridor is smaller too. */
export const JUNCTION_PASS_PAD = 4;

/**
 * Partner arcs always bow the same way on screen, away from the generation
 * band that holds the children.
 */
export const PARTNER_CURVE = 0.14;
/** Sibling arms splay out of their junction instead of forming one straight line. */
export const CHILD_FAN_CURVE = 0.06;
/** Parent arms are only nudged off the exact chord. */
export const PARENT_CURVE = 0.03;

/** Vertical distance between generation bands in graph units. */
export const LEVEL_SPACING = 110;
/** Weak enough to lean on the birth-year drift instead of replacing it. */
export const LEVEL_STRENGTH = 0.035;

export const CLEARANCE_PAD = 8;
export const CLEARANCE_STRENGTH = 0.6;
export const CLEARANCE_MAX_PUSH = 8;

export type SegmentHit = {
  distance: number;
  x: number;
  y: number;
  t: number;
};

/** Distance from a point to the closest point on a segment. */
export function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): SegmentHit {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared > 0
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
      : 0;
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { distance: Math.hypot(px - x, py - y), x, y, t };
}

/**
 * Samples the quadratic curve force-graph would draw for a geometry, so the
 * link painter, the clearance force and the tests all agree on the shape. A
 * positive curvature bows to the left of the source to target vector, which is
 * up on screen when the edge runs left to right.
 */
export function quadraticPoints(
  a: Point,
  b: Point,
  curvature: number,
  steps = 12,
): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!curvature || length === 0 || steps < 2) return [a, b];
  const angle = Math.atan2(dy, dx);
  const offset = length * curvature;
  const control = {
    x: (a.x + b.x) / 2 + offset * Math.cos(angle - Math.PI / 2),
    y: (a.y + b.y) / 2 + offset * Math.sin(angle - Math.PI / 2),
  };
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * a.x + 2 * inverse * t * control.x + t * t * b.x,
      y: inverse * inverse * a.y + 2 * inverse * t * control.y + t * t * b.y,
    });
  }
  return points;
}

type Range = { start: number; end: number };

function cumulativeLengths(points: readonly Point[]) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] +
        Math.hypot(
          points[index].x - points[index - 1].x,
          points[index].y - points[index - 1].y,
        ),
    );
  }
  return cumulative;
}

export function polylineLength(points: readonly Point[]) {
  if (points.length < 2) return 0;
  const cumulative = cumulativeLengths(points);
  return cumulative[cumulative.length - 1];
}

/**
 * The part of a polyline between two arc lengths. Used to pull a link back from
 * the avatars it connects without cutting a gap that could swallow a short
 * edge.
 */
export function pathSlice(
  points: readonly Point[],
  start: number,
  end: number,
): Point[] {
  if (points.length < 2) return [];
  const cumulative = cumulativeLengths(points);
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [];
  const from = Math.max(0, Math.min(start, total));
  const to = Math.max(from, Math.min(end, total));
  if (to <= from) return [];
  return pointsAlong(points, cumulative, from, to);
}

/**
 * Cuts a polyline wherever it enters one of the circles and returns the pieces
 * that stay outside. Overlapping circles merge into one gap, and a path that is
 * fully covered returns no runs at all.
 */
export function splitPathOutsideCircles(
  points: readonly Point[],
  circles: readonly Circle[],
): Point[][] {
  if (points.length < 2) return [];
  if (!circles.length) return [[...points]];

  const cumulative = cumulativeLengths(points);
  const total = cumulative[cumulative.length - 1];
  if (total === 0) return [];

  const ranges: Range[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = cumulative[index];
    const segmentLength = cumulative[index + 1] - start;
    for (const circle of circles) {
      const hit = circleSegmentRange(points[index], points[index + 1], circle);
      if (!hit) continue;
      ranges.push({
        start: start + hit.start * segmentLength,
        end: start + hit.end * segmentLength,
      });
    }
  }
  if (!ranges.length) return [[...points]];

  ranges.sort((left, right) => left.start - right.start);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }

  const runs: Point[][] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      runs.push(pointsAlong(points, cumulative, cursor, range.start));
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < total) {
    runs.push(pointsAlong(points, cumulative, cursor, total));
  }
  return runs.filter(run => run.length >= 2);
}

function circleSegmentRange(
  a: Point,
  b: Point,
  circle: Circle,
): { start: number; end: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return null;
  const fx = a.x - circle.x;
  const fy = a.y - circle.y;
  const linear = 2 * (fx * dx + fy * dy);
  const constant = fx * fx + fy * fy - circle.radius * circle.radius;
  const discriminant = linear * linear - 4 * lengthSquared * constant;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const start = (-linear - root) / (2 * lengthSquared);
  const end = (-linear + root) / (2 * lengthSquared);
  if (end <= 0 || start >= 1) return null;
  return { start: Math.max(0, start), end: Math.min(1, end) };
}

function pointsAlong(
  points: readonly Point[],
  cumulative: readonly number[],
  start: number,
  end: number,
): Point[] {
  const run: Point[] = [pointAt(points, cumulative, start)];
  for (let index = 0; index < points.length; index += 1) {
    if (cumulative[index] > start && cumulative[index] < end) {
      run.push(points[index]);
    }
  }
  const last = pointAt(points, cumulative, end);
  const previous = run[run.length - 1];
  if (previous.x !== last.x || previous.y !== last.y) run.push(last);
  return run;
}

function pointAt(
  points: readonly Point[],
  cumulative: readonly number[],
  distance: number,
): Point {
  if (distance <= 0) return { ...points[0] };
  for (let index = 1; index < points.length; index += 1) {
    if (distance > cumulative[index]) continue;
    const span = cumulative[index] - cumulative[index - 1];
    const t = span > 0 ? (distance - cumulative[index - 1]) / span : 0;
    return {
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * t,
    };
  }
  return { ...points[points.length - 1] };
}

function compareOrder(left: number, right: number) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function childOrder(model: Pick<GraphModel, "byId">, link: GraphLink) {
  const node = model.byId.get(nodeIdOf(link.target));
  const year = node?.person ? fuzzyOrderYear(node.person.birthDate) : null;
  return year ?? Number.POSITIVE_INFINITY;
}

/**
 * Curvature per link. Partners always arc the same way, sibling arms leave a
 * junction as a fan in birth order, and parent arms alternate so no two arms
 * can lie on the same line. The sign of a partner arc is normalised later,
 * because it depends on which endpoint is drawn first.
 */
export function linkCurvatures(
  model: Pick<GraphModel, "links" | "byId">,
): Map<string, number> {
  const curvatures = new Map<string, number>();
  const childrenByJunction = new Map<string, GraphLink[]>();
  const parentsByJunction = new Map<string, GraphLink[]>();

  for (const link of model.links) {
    if (link.kind === "partner") {
      curvatures.set(link.id, PARTNER_CURVE);
      continue;
    }
    if (link.kind !== "child" && link.kind !== "parent") continue;
    const junctionId =
      link.kind === "child" ? nodeIdOf(link.source) : nodeIdOf(link.target);
    const groups = link.kind === "child" ? childrenByJunction : parentsByJunction;
    const group = groups.get(junctionId) ?? [];
    group.push(link);
    groups.set(junctionId, group);
  }

  for (const links of childrenByJunction.values()) {
    const ordered = [...links].sort((left, right) => {
      const byYear = compareOrder(
        childOrder(model, left),
        childOrder(model, right),
      );
      if (byYear !== 0) return byYear;
      const leftNode = model.byId.get(nodeIdOf(left.target));
      const rightNode = model.byId.get(nodeIdOf(right.target));
      return (leftNode?.name ?? "").localeCompare(rightNode?.name ?? "");
    });
    ordered.forEach((link, index) => {
      const spread =
        ordered.length <= 1
          ? 0
          : (index - (ordered.length - 1) / 2) / ((ordered.length - 1) / 2);
      curvatures.set(link.id, CHILD_FAN_CURVE * spread);
    });
  }

  for (const links of parentsByJunction.values()) {
    const ordered = [...links].sort((left, right) =>
      nodeIdOf(left.source).localeCompare(nodeIdOf(right.source)),
    );
    ordered.forEach((link, index) => {
      curvatures.set(link.id, (index % 2 === 0 ? 1 : -1) * PARENT_CURVE);
    });
  }

  return curvatures;
}

export function maxGenerationLevel(levels: Iterable<number>) {
  let max = 0;
  for (const level of levels) {
    if (level > max) max = level;
  }
  return max;
}

/** Centre of the band for one generation, so the tree stays around y = 0. */
export function generationTargetY(level: number, maxLevel: number) {
  return (level - maxLevel / 2) * LEVEL_SPACING;
}

type ResolvedSegment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  a: GraphNode;
  b: GraphNode;
};

export type LinkClearanceOptions = {
  pad?: number;
  strength?: number;
  maxPush?: number;
  cellSize?: number;
};

export type LinkClearanceForce = {
  (alpha: number): void;
  initialize(nodes: GraphNode[]): void;
};

/**
 * Pushes people out of the corridor of links that do not belong to them, so an
 * unrelated line cannot settle across an avatar. Links are bucketed in a grid,
 * which keeps a tick linear even when the tree is dense. The correction is
 * positional, like d3's collide force, because a velocity nudge loses to the
 * link springs once the simulation cools.
 */
export function forceLinkClearance(
  links: () => readonly GraphLink[],
  options: LinkClearanceOptions = {},
): LinkClearanceForce {
  const pad = options.pad ?? CLEARANCE_PAD;
  const strength = options.strength ?? CLEARANCE_STRENGTH;
  const maxPush = options.maxPush ?? CLEARANCE_MAX_PUSH;
  const cellSize = options.cellSize ?? 96;
  const grid = new Map<number, ResolvedSegment[]>();
  let nodes: GraphNode[] = [];

  const key = (ix: number, iy: number) => ix * 100003 + iy;
  const cell = (value: number) => Math.floor(value / cellSize);
  const add = (ix: number, iy: number, segment: ResolvedSegment) => {
    const bucket = grid.get(key(ix, iy));
    if (bucket) bucket.push(segment);
    else grid.set(key(ix, iy), [segment]);
  };

  const force = (alpha: number) => {
    if (alpha <= 0 || !nodes.length) return;
    grid.clear();

    for (const link of links()) {
      if (link.kind === "media") continue;
      const a = link.source as unknown as GraphNode;
      const b = link.target as unknown as GraphNode;
      if (!a || !b || typeof a !== "object" || typeof b !== "object") continue;
      if (a.x == null || a.y == null || b.x == null || b.y == null) continue;

      const segment: ResolvedSegment = {
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        a,
        b,
      };
      const margin = cellSize / 2;
      const startX = cell(Math.min(a.x, b.x) - margin);
      const endX = cell(Math.max(a.x, b.x) + margin);
      const startY = cell(Math.min(a.y, b.y) - margin);
      const endY = cell(Math.max(a.y, b.y) + margin);
      const cells = (endX - startX + 1) * (endY - startY + 1);

      if (cells > 64) {
        // A long link would cover too many cells, so sample it instead. The
        // query dedupes, which keeps the repeated inserts harmless.
        const steps = Math.max(
          1,
          Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / margin),
        );
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const ix = cell(x);
          const iy = cell(y);
          for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) add(ix + dx, iy + dy, segment);
          }
        }
        continue;
      }

      for (let ix = startX; ix <= endX; ix += 1) {
        for (let iy = startY; iy <= endY; iy += 1) add(ix, iy, segment);
      }
    }

    const nearby = new Set<ResolvedSegment>();
    for (const node of nodes) {
      if (node.kind !== "person") continue;
      if (node.x == null || node.y == null) continue;
      const bucket = grid.get(key(cell(node.x), cell(node.y)));
      if (!bucket) continue;
      const clearance = nodeRadius(node) + pad;
      nearby.clear();
      for (const segment of bucket) nearby.add(segment);

      for (const segment of nearby) {
        if (segment.a.id === node.id || segment.b.id === node.id) continue;
        // Collision and the link springs already own the space inside the
        // endpoint circles, so only push where a line passes through open
        // space. The endpoint radius is used without the clearance corridor,
        // otherwise a person standing near their own relative would be exempt
        // from every line that relative owns.
        if (
          Math.hypot(node.x - segment.ax, node.y - segment.ay) <=
          nodeRadius(segment.a) + 4
        ) {
          continue;
        }
        if (
          Math.hypot(node.x - segment.bx, node.y - segment.by) <=
          nodeRadius(segment.b) + 4
        ) {
          continue;
        }
        const hit = segmentDistance(
          node.x,
          node.y,
          segment.ax,
          segment.ay,
          segment.bx,
          segment.by,
        );
        if (hit.distance >= clearance) continue;

        let nx: number;
        let ny: number;
        if (hit.distance > 0.001) {
          nx = (node.x - hit.x) / hit.distance;
          ny = (node.y - hit.y) / hit.distance;
        } else {
          const dx = segment.bx - segment.ax;
          const dy = segment.by - segment.ay;
          const length = Math.hypot(dx, dy) || 1;
          const side = (segment.a.id + segment.b.id).length % 2 === 0 ? 1 : -1;
          nx = (-dy / length) * side;
          ny = (dx / length) * side;
        }
        const push = Math.min(
          maxPush,
          (clearance - hit.distance) * strength,
        );
        // A positional correction, like d3's collide force. A velocity nudge
        // alone loses to the link springs and the person settles back onto the
        // line once the simulation cools.
        node.x += nx * push;
        node.y += ny * push;
        node.vx = (node.vx ?? 0) + nx * push * 0.5;
        node.vy = (node.vy ?? 0) + ny * push * 0.5;
      }
    }
  };

  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };

  return force;
}
