export type PresencePeer = {
  peerId: string;
  userId: string;
  displayName: string;
  nodeId: string | null;
};

export type PresenceServerMessage =
  | { type: "presence"; peers: PresencePeer[] }
  | { type: "hello"; peerId: string }
  | { type: "pong" }
  | { type: "tree-changed"; at: string };

export type PresenceClientMessage =
  | { type: "focus"; nodeId: string | null }
  | { type: "ping" };

export type PresenceStatus = "connecting" | "online" | "offline";
