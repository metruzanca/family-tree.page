import type { PresencePeer } from "../lib/presence-protocol";
import { isUuid } from "./ids";

/**
 * Presence state lives in this process. That is exact while the app runs a
 * single Railway replica. If more replicas are ever added, replace this hub
 * with one backed by Redis (or Postgres LISTEN/NOTIFY) plus a shared roster.
 */
export type PresenceHub = {
  join(treeId: string, peer: PresencePeer): void;
  focus(treeId: string, peerId: string, nodeId: string | null): void;
  leave(treeId: string, peerId: string): void;
  peers(treeId: string): PresencePeer[];
};

const MAX_NODE_ID_LENGTH = 80;

type TreeChangeListener = (treeId: string) => void;

const globalForPresence = globalThis as unknown as {
  __familyTreeTreeChangeListeners?: Set<TreeChangeListener>;
};

function treeChangeListeners() {
  if (!globalForPresence.__familyTreeTreeChangeListeners) {
    globalForPresence.__familyTreeTreeChangeListeners = new Set();
  }
  return globalForPresence.__familyTreeTreeChangeListeners;
}

/**
 * Registered by the Nitro WebSocket route. The global set keeps the bus shared
 * even if the bundler produces more than one copy of this module.
 */
export function subscribeTreeChanges(listener: TreeChangeListener) {
  const listeners = treeChangeListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyTreeChanged(treeId: string) {
  for (const listener of treeChangeListeners()) {
    try {
      listener(treeId);
    } catch (error) {
      console.error("Tree change listener failed", error);
    }
  }
}

export function normalizeNodeId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_NODE_ID_LENGTH) return null;
  if (isUuid(value)) return value;
  for (const prefix of ["file:", "group:"]) {
    if (value.startsWith(prefix) && isUuid(value.slice(prefix.length))) return value;
  }
  return null;
}

export function createPresenceHub(): PresenceHub {
  const trees = new Map<string, Map<string, PresencePeer>>();

  function room(treeId: string) {
    let peers = trees.get(treeId);
    if (!peers) {
      peers = new Map();
      trees.set(treeId, peers);
    }
    return peers;
  }

  function peers(treeId: string): PresencePeer[] {
    const current = trees.get(treeId);
    if (!current) return [];
    return [...current.values()]
      .map(peer => ({ ...peer }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.peerId.localeCompare(b.peerId));
  }

  return {
    join(treeId, peer) {
      room(treeId).set(peer.peerId, { ...peer });
    },
    focus(treeId, peerId, nodeId) {
      const peer = trees.get(treeId)?.get(peerId);
      if (peer) peer.nodeId = nodeId;
    },
    leave(treeId, peerId) {
      const current = trees.get(treeId);
      if (!current) return;
      current.delete(peerId);
      if (current.size === 0) trees.delete(treeId);
    },
    peers,
  };
}

export const presenceHub = createPresenceHub();
