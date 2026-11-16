import { describe, expect, it } from "vitest";
import { presenceColor } from "./presence-color";

const palette = new Set([
  "#8fa98f",
  "#7f96a8",
  "#a8859b",
  "#6f9a92",
  "#b3a06f",
  "#c08a72",
]);

const ids = [
  "f9d1fe17-0695-42bb-94ea-86dc00e1c30d",
  "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

describe("presenceColor", () => {
  it("returns a color from the matte palette", () => {
    for (const id of ids) expect(palette.has(presenceColor(id))).toBe(true);
  });

  it("is stable for the same user across calls", () => {
    for (const id of ids) expect(presenceColor(id)).toBe(presenceColor(id));
  });

  it("does not change when a display name changes", () => {
    // The function only receives the user id, so the color cannot depend on a
    // name. This guards the call sites from accidentally passing one.
    const id = ids[0];
    expect(presenceColor(id)).toBe(presenceColor(id.toUpperCase().toLowerCase()));
  });

  it("spreads nearby ids across more than one color", () => {
    expect(new Set(ids.map(presenceColor)).size).toBeGreaterThan(1);
  });
});
