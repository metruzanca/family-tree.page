import { describe, expect, it } from "vitest";
import { createPresenceHub, normalizeNodeId } from "./presence";

const TREE = "11111111-1111-4111-8111-111111111111";
const OTHER_TREE = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";

const demo = {
  peerId: "peer-demo",
  userId: "user-demo",
  displayName: "Demo Simpson",
  nodeId: null,
};

const rosa = {
  peerId: "peer-rosa",
  userId: "user-rosa",
  displayName: "Rosa Test",
  nodeId: null,
};

describe("presence hub", () => {
  it("lists everyone in a tree and nothing from other trees", () => {
    const hub = createPresenceHub();
    hub.join(TREE, demo);
    hub.join(OTHER_TREE, rosa);

    expect(hub.peers(TREE).map(peer => peer.peerId)).toEqual([demo.peerId]);
    expect(hub.peers(OTHER_TREE).map(peer => peer.peerId)).toEqual([rosa.peerId]);
  });

  it("tracks one focused node per peer and keeps two tabs of one user separate", () => {
    const hub = createPresenceHub();
    const secondTab = { ...demo, peerId: "peer-demo-2" };
    hub.join(TREE, demo);
    hub.join(TREE, secondTab);
    hub.focus(TREE, demo.peerId, PERSON);
    hub.focus(TREE, secondTab.peerId, `file:${PERSON}`);

    expect(hub.peers(TREE)).toHaveLength(2);
    expect(hub.peers(TREE).find(peer => peer.peerId === demo.peerId)?.nodeId).toBe(PERSON);
    expect(hub.peers(TREE).find(peer => peer.peerId === secondTab.peerId)?.nodeId).toBe(
      `file:${PERSON}`,
    );
  });

  it("moves a focus to the tree view without removing the peer", () => {
    const hub = createPresenceHub();
    hub.join(TREE, demo);
    hub.focus(TREE, demo.peerId, PERSON);
    hub.focus(TREE, demo.peerId, null);

    expect(hub.peers(TREE)).toEqual([{ ...demo, nodeId: null }]);
  });

  it("removes peers on leave and drops an empty tree", () => {
    const hub = createPresenceHub();
    hub.join(TREE, demo);
    hub.join(TREE, rosa);
    hub.leave(TREE, demo.peerId);

    expect(hub.peers(TREE).map(peer => peer.peerId)).toEqual([rosa.peerId]);

    hub.leave(TREE, rosa.peerId);
    expect(hub.peers(TREE)).toEqual([]);

    hub.join(TREE, rosa);
    expect(hub.peers(TREE)).toHaveLength(1);
  });

  it("ignores focus updates for unknown peers", () => {
    const hub = createPresenceHub();
    hub.join(TREE, demo);
    hub.focus(TREE, "missing-peer", PERSON);

    expect(hub.peers(TREE)[0].nodeId).toBeNull();
  });
});

describe("normalizeNodeId", () => {
  it("accepts people, files, and albums", () => {
    expect(normalizeNodeId(PERSON)).toBe(PERSON);
    expect(normalizeNodeId(`file:${PERSON}`)).toBe(`file:${PERSON}`);
    expect(normalizeNodeId(`group:${PERSON}`)).toBe(`group:${PERSON}`);
  });

  it("rejects anything else", () => {
    expect(normalizeNodeId(null)).toBeNull();
    expect(normalizeNodeId("")).toBeNull();
    expect(normalizeNodeId("person")).toBeNull();
    expect(normalizeNodeId(`person:${PERSON}`)).toBeNull();
    expect(normalizeNodeId(`file:${PERSON}x`)).toBeNull();
    expect(normalizeNodeId(`${PERSON}${PERSON}`)).toBeNull();
  });
});
