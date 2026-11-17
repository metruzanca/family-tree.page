import { describe, expect, it } from "vitest";
import {
  clampFaceBox,
  faceCropRect,
  intersectionOverUnion,
  planFaceRescan,
} from "./face-box";

describe("face boxes", () => {
  it("clamps a box to the image and rounds it", () => {
    expect(
      clampFaceBox({ x: -0.2, y: 0.9, width: 0.5, height: 0.5 }),
    ).toEqual({ x: 0, y: 0.9, width: 0.5, height: 0.1 });
  });

  it("never produces a negative size for a non-finite box", () => {
    expect(clampFaceBox({ x: 2, y: 2, width: Number.NaN, height: 1 })).toEqual({
      x: 1,
      y: 1,
      width: 0,
      height: 0,
    });
  });

  it("scores identical and disjoint boxes", () => {
    const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    expect(intersectionOverUnion(box, box)).toBeCloseTo(1);
    expect(
      intersectionOverUnion(box, { x: 0.5, y: 0.5, width: 0.2, height: 0.2 }),
    ).toBe(0);
  });

  it("handles a partial overlap", () => {
    expect(
      intersectionOverUnion(
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 0.5, y: 0, width: 1, height: 1 },
      ),
    ).toBeCloseTo(1 / 3);
  });
});

describe("planFaceRescan", () => {
  const existing = [
    { id: "linked", box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, status: "assigned" as const },
    { id: "ignored", box: { x: 0.5, y: 0.1, width: 0.2, height: 0.2 }, status: "ignored" as const },
    { id: "stale", box: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }, status: "unassigned" as const },
  ];

  it("keeps links and ignores while moving a matched box", () => {
    const plan = planFaceRescan(existing, [
      { box: { x: 0.11, y: 0.11, width: 0.2, height: 0.2 }, confidence: 0.9 },
      { box: { x: 0.49, y: 0.1, width: 0.2, height: 0.2 }, confidence: 0.8 },
      { box: { x: 0.3, y: 0.6, width: 0.2, height: 0.2 }, confidence: 0.7 },
    ]);

    expect(plan.updates.map(update => update.id).sort()).toEqual(["ignored", "linked"]);
    expect(plan.additions).toHaveLength(1);
    expect(plan.removals).toEqual(["stale"]);
  });

  it("adds everything when the photo has never been scanned", () => {
    const plan = planFaceRescan([], [
      { box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, confidence: 0.9 },
    ]);
    expect(plan.additions).toHaveLength(1);
    expect(plan.updates).toEqual([]);
    expect(plan.removals).toEqual([]);
  });
});

describe("face crop", () => {
  it("scales and offsets the image so the box fills the chip", () => {
    const rect = faceCropRect(
      { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      1000,
      500,
      64,
    );
    expect(rect).toEqual({ width: 256, height: 128, left: -128, top: -64 });
  });

  it("falls back to a plain chip without dimensions", () => {
    expect(
      faceCropRect({ x: 0, y: 0, width: 0.2, height: 0.2 }, 0, 0, 40),
    ).toEqual({ width: 40, height: 40, left: 0, top: 0 });
  });
});
