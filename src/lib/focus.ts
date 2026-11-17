import type { GraphPerson, GraphRelationship } from "~/api/people-server";

/**
 * How much of the tree the viewer wants around their own person. A radius is a
 * number of relationship hops, so it works the same for blood relatives,
 * partners, and families joined by marriage.
 */
export type FocusRadius = 1 | 2 | 3 | 4 | "all";

export type FocusBand = {
  radius: FocusRadius;
  label: string;
  description: string;
};

export const FOCUS_BANDS: FocusBand[] = [
  {
    radius: 1,
    label: "Immediate family",
    description: "Your partner, parents and children",
  },
  {
    radius: 2,
    label: "Close family",
    description: "Siblings, grandparents, grandchildren and in-laws",
  },
  {
    radius: 3,
    label: "Extended family",
    description: "Aunts, uncles, nieces, nephews and great-grandparents",
  },
  {
    radius: 4,
    label: "Cousins",
    description: "First cousins, great-aunts and great-uncles",
  },
  {
    radius: "all",
    label: "Everyone",
    description: "The whole tree, with nothing hidden",
  },
];

/** Trees below this size are shown whole until the viewer asks otherwise. */
export const SMALL_TREE_SIZE = 25;

export const DEFAULT_FOCUS_RADIUS: FocusRadius = 4;

export function defaultFocusRadius(peopleCount: number): FocusRadius {
  return peopleCount < SMALL_TREE_SIZE ? "all" : DEFAULT_FOCUS_RADIUS;
}

export function parseFocusRadius(value: string | null | undefined): FocusRadius | null {
  if (value === "all") return "all";
  const parsed = Number(value);
  if (Number.isInteger(parsed) && FOCUS_BANDS.some(band => band.radius === parsed)) {
    return parsed as FocusRadius;
  }
  return null;
}

export type FocusView = {
  /** People the graph should draw. */
  visible: Set<string>;
  distances: Map<string, number>;
  /** The next radius that would reveal someone, or null when everything is visible. */
  nextRadius: FocusRadius | null;
  /** People who appear when nextRadius is applied. */
  nextRingCount: number;
  total: number;
};

type Adjacency = Map<string, Set<string>>;

function connect(adjacency: Adjacency, a: string, b: string) {
  const forA = adjacency.get(a) ?? new Set<string>();
  forA.add(b);
  adjacency.set(a, forA);
  const forB = adjacency.get(b) ?? new Set<string>();
  forB.add(a);
  adjacency.set(b, forB);
}

/**
 * The whole relationship graph, undirected. A parent-child edge and a
 * partnership edge both count as one hop, which keeps the distance intuitive
 * for people joined by marriage.
 */
export function buildPersonAdjacency(
  relationships: GraphRelationship[],
): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const relationship of relationships) {
    connect(adjacency, relationship.source, relationship.target);
  }
  return adjacency;
}

function buildPartnerAdjacency(relationships: GraphRelationship[]): Adjacency {
  const adjacency: Adjacency = new Map();
  for (const relationship of relationships) {
    if (relationship.type !== "partner") continue;
    connect(adjacency, relationship.source, relationship.target);
  }
  return adjacency;
}

export function computeFocusDistances(
  focusId: string | null,
  relationships: GraphRelationship[],
): Map<string, number> {
  const distances = new Map<string, number>();
  if (!focusId) return distances;
  const adjacency = buildPersonAdjacency(relationships);
  const queue: string[] = [focusId];
  distances.set(focusId, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

/**
 * Partners of anyone already inside the radius come along with them, so a
 * spouse is never cut off one hop away from the family you can see.
 */
function addPartnerClosure(
  relationships: GraphRelationship[],
  visible: Set<string>,
): Set<string> {
  const partners = buildPartnerAdjacency(relationships);
  const result = new Set(visible);
  const queue = [...visible];
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of partners.get(queue[index]) ?? []) {
      if (result.has(next)) continue;
      result.add(next);
      queue.push(next);
    }
  }
  return result;
}

/** People with no relationships at all. They are always shown so a new person never vanishes. */
function unconnectedPeople(
  people: GraphPerson[],
  relationships: GraphRelationship[],
): Set<string> {
  const connected = new Set<string>();
  for (const relationship of relationships) {
    connected.add(relationship.source);
    connected.add(relationship.target);
  }
  return new Set(
    people.filter(person => !connected.has(person.id)).map(person => person.id),
  );
}

function visibleAtRadius(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  distances: Map<string, number>,
  radius: number | "all",
  pinned: Set<string>,
): Set<string> {
  const visible = new Set<string>(pinned);
  if (radius === "all") {
    for (const person of people) visible.add(person.id);
    return visible;
  }
  for (const person of people) {
    const distance = distances.get(person.id);
    if (distance != null && distance <= radius) visible.add(person.id);
  }
  return addPartnerClosure(relationships, visible);
}

export type FocusOptions = {
  focusId: string | null;
  radius: FocusRadius;
  /** Nodes that must stay visible for the session, for example a revealed search result. */
  pinned?: Iterable<string>;
};

/**
 * Resolves the people a focused graph should render. When there is no focus
 * person the whole tree is visible, because hiding parts of a tree behind a
 * stranger's centre would be surprising.
 */
export function resolveFocus(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  options: FocusOptions,
): FocusView {
  const known = new Set(people.map(person => person.id));
  const focusId = options.focusId && known.has(options.focusId) ? options.focusId : null;
  const distances = computeFocusDistances(focusId, relationships);
  const pinned = new Set(
    [...(options.pinned ?? [])].filter(personId => known.has(personId)),
  );
  const total = people.length;

  if (!focusId) {
    return {
      visible: new Set(known),
      distances,
      nextRadius: null,
      nextRingCount: 0,
      total,
    };
  }

  const base = unconnectedPeople(people, relationships);
  const visible = visibleAtRadius(
    people,
    relationships,
    distances,
    options.radius,
    new Set([...pinned, ...base]),
  );

  if (options.radius === "all" || visible.size >= total) {
    return { visible, distances, nextRadius: null, nextRingCount: 0, total };
  }

  const current = options.radius as number;
  const candidates = [1, 2, 3, 4].filter(
    candidate => candidate > current,
  ) as FocusRadius[];
  for (const candidate of candidates) {
    const wider = visibleAtRadius(
      people,
      relationships,
      distances,
      candidate,
      new Set([...pinned, ...base]),
    );
    if (wider.size > visible.size) {
      return {
        visible,
        distances,
        nextRadius: candidate,
        nextRingCount: wider.size - visible.size,
        total,
      };
    }
  }

  return { visible, distances, nextRadius: "all", nextRingCount: total - visible.size, total };
}

/**
 * Shortest chain of relationships between two people, used to pull a hidden
 * search result into view without opening up the rest of the tree.
 */
export function shortestPath(
  relationships: GraphRelationship[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return [fromId];
  const adjacency = buildPersonAdjacency(relationships);
  const previous = new Map<string, string>();
  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, current);
      if (next === toId) {
        const path = [toId];
        let step = toId;
        while (step !== fromId) {
          const before = previous.get(step);
          if (!before) return null;
          path.push(before);
          step = before;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
