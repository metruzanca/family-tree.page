import { createReconnectingWS } from "@solid-primitives/websocket";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type {
  PresenceClientMessage,
  PresencePeer,
  PresenceServerMessage,
  PresenceStatus,
} from "./presence-protocol";

export type TreeChange = { at: string; seq: number };

/** Well under proxy idle timeouts (Cloudflare closes after ~100s of silence). */
const PRESENCE_PING_INTERVAL_MS = 25_000;

export type TreePresence = {
  peers: () => PresencePeer[];
  status: () => PresenceStatus;
  selfPeerId: () => string | null;
  change: () => TreeChange | null;
};

export function isPresencePeer(value: unknown): value is PresencePeer {
  if (!value || typeof value !== "object") return false;
  const peer = value as Record<string, unknown>;
  return (
    typeof peer.peerId === "string" &&
    typeof peer.userId === "string" &&
    typeof peer.displayName === "string" &&
    (peer.nodeId === null || typeof peer.nodeId === "string")
  );
}

/**
 * Tracks who else has this tree open and which node they are looking at.
 *
 * Nitro owns the socket server (see `server/routes/presence.ts`). This side
 * reconnects after deploys and sleeps, and buffers the first focus message
 * until the connection opens.
 */
export function createTreePresence(options: {
  treeId: string;
  nodeId: () => string | null;
}): TreePresence {
  const [peers, setPeers] = createSignal<PresencePeer[]>([]);
  const [selfPeerId, setSelfPeerId] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<PresenceStatus>("connecting");
  const [change, setChange] = createSignal<TreeChange | null>(null);

  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return { peers, status, selfPeerId, change };
  }

  const endpoint = new URL("/presence", window.location.href);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("treeId", options.treeId);

  const socket = createReconnectingWS(endpoint.toString(), undefined, { delay: 2500 });

  let sentNodeId: string | null | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  function stopKeepalive() {
    if (!keepalive) return;
    clearInterval(keepalive);
    keepalive = undefined;
  }

  function sendFocus(nodeId: string | null) {
    sentNodeId = nodeId;
    socket.send(JSON.stringify({ type: "focus", nodeId } satisfies PresenceClientMessage));
  }

  socket.addEventListener("open", () => {
    setStatus("online");
    sendFocus(options.nodeId());
    // Proxies close idle sockets, and each reconnect makes every open tab
    // refetch the tree. A small ping keeps the connection (and the roster)
    // alive; the server answers with pong.
    stopKeepalive();
    keepalive = setInterval(() => {
      socket.send(JSON.stringify({ type: "ping" } satisfies PresenceClientMessage));
    }, PRESENCE_PING_INTERVAL_MS);
  });

  socket.addEventListener("close", () => {
    stopKeepalive();
    setStatus("offline");
    setPeers([]);
    setSelfPeerId(null);
    sentNodeId = undefined;
  });

  onCleanup(stopKeepalive);

  socket.addEventListener("message", event => {
    if (typeof event.data !== "string") return;
    let message: PresenceServerMessage;
    try {
      message = JSON.parse(event.data) as PresenceServerMessage;
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.type === "hello") {
      if (typeof message.peerId === "string") setSelfPeerId(message.peerId);
      return;
    }
    if (message.type === "presence" && Array.isArray(message.peers)) {
      setPeers(message.peers.filter(isPresencePeer));
      return;
    }
    if (message.type === "tree-changed") {
      setChange({
        at: typeof message.at === "string" ? message.at : new Date().toISOString(),
        seq: (change()?.seq ?? 0) + 1,
      });
    }
  });

  createEffect(() => {
    const nodeId = options.nodeId();
    if (nodeId === sentNodeId) return;
    sendFocus(nodeId);
  });

  return { peers, status, selfPeerId, change };
}
