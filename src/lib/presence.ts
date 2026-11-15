import { createReconnectingWS } from "@solid-primitives/websocket";
import { createEffect, createSignal } from "solid-js";
import type {
  PresenceClientMessage,
  PresencePeer,
  PresenceServerMessage,
  PresenceStatus,
} from "./presence-protocol";

export type TreePresence = {
  peers: () => PresencePeer[];
  status: () => PresenceStatus;
  selfPeerId: () => string | null;
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

  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return { peers, status, selfPeerId };
  }

  const endpoint = new URL("/presence", window.location.href);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("treeId", options.treeId);

  const socket = createReconnectingWS(endpoint.toString(), undefined, { delay: 2500 });

  function sendFocus(nodeId: string | null) {
    socket.send(JSON.stringify({ type: "focus", nodeId } satisfies PresenceClientMessage));
  }

  socket.addEventListener("open", () => {
    setStatus("online");
    sendFocus(options.nodeId());
  });

  socket.addEventListener("close", () => {
    setStatus("offline");
    setPeers([]);
    setSelfPeerId(null);
  });

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
    }
  });

  createEffect(() => {
    sendFocus(options.nodeId());
  });

  return { peers, status, selfPeerId };
}
