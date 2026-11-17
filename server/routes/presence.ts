import { log } from "../../src/server/logger";
import { defineWebSocketHandler } from "nitro";
import { authenticatePresence } from "../../src/server/presence-auth";
import {
  normalizeNodeId,
  presenceHub,
  subscribeTreeChanges,
} from "../../src/server/presence";
import { captureServerError } from "../../src/server/sentry";
import type {
  PresenceServerMessage,
  PresenceClientMessage,
} from "../../src/lib/presence-protocol";

type PresenceContext = {
  treeId: string;
  userId: string;
  displayName: string;
};

const TOPIC = "presence";
const MAX_MESSAGE_LENGTH = 512;
const changeSubscriptions = new Map<string, () => void>();

function snapshot(treeId: string): PresenceServerMessage {
  return { type: "presence", peers: presenceHub.peers(treeId) };
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const treeId = new URL(request.url).searchParams.get("treeId") ?? "";
    const identity = await authenticatePresence(request, treeId);
    if (!identity) {
      throw new Response("Unauthorized", { status: 401 });
    }
    return {
      namespace: `tree:${treeId}`,
      context: { treeId, ...identity } satisfies PresenceContext,
    };
  },

  open(peer) {
    const context = peer.context as PresenceContext;
    peer.subscribe(TOPIC);
    presenceHub.join(context.treeId, {
      peerId: peer.id,
      userId: context.userId,
      displayName: context.displayName,
      nodeId: null,
    });
    peer.send({ type: "hello", peerId: peer.id } satisfies PresenceServerMessage);
    const presence = snapshot(context.treeId);
    peer.send(presence);
    peer.publish(TOPIC, presence);

    const unsubscribe = subscribeTreeChanges(treeId => {
      if (treeId !== context.treeId) return;
      try {
        peer.send({
          type: "tree-changed",
          at: new Date().toISOString(),
        } satisfies PresenceServerMessage);
      } catch {
        // The socket is closing; the close handler removes the subscription.
      }
    });
    changeSubscriptions.set(peer.id, unsubscribe);
  },

  message(peer, message) {
    const context = peer.context as PresenceContext;
    const text = message.text();
    if (text.length > MAX_MESSAGE_LENGTH) {
      peer.close(1009, "Message too large");
      return;
    }
    let parsed: PresenceClientMessage;
    try {
      parsed = JSON.parse(text) as PresenceClientMessage;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "ping") {
      peer.send({ type: "pong" } satisfies PresenceServerMessage);
      return;
    }

    if (parsed.type === "focus") {
      presenceHub.focus(context.treeId, peer.id, normalizeNodeId(parsed.nodeId));
      const presence = snapshot(context.treeId);
      peer.send(presence);
      peer.publish(TOPIC, presence);
    }
  },

  close(peer) {
    const context = peer.context as PresenceContext;
    changeSubscriptions.get(peer.id)?.();
    changeSubscriptions.delete(peer.id);
    presenceHub.leave(context.treeId, peer.id);
    peer.publish(TOPIC, snapshot(context.treeId));
  },

  error(peer, error) {
    log.error("presence.socket_error", { peerId: peer.id, error });
    captureServerError(error, { source: "presence", peerId: peer.id });
  },
});
