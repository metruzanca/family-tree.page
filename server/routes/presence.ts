import { defineWebSocketHandler } from "nitro";
import { authenticatePresence } from "../../src/server/presence-auth";
import { normalizeNodeId, presenceHub } from "../../src/server/presence";
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
    presenceHub.leave(context.treeId, peer.id);
    peer.publish(TOPIC, snapshot(context.treeId));
  },

  error(peer, error) {
    console.error("Presence socket error", peer.id, error);
  },
});
