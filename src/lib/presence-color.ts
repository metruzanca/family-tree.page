/**
 * Matte colors that read on the dark graph canvas and sit beside the moss,
 * sage, gold, and clay palette. Gold means "selected" and near-white means
 * "hovered", so neither is used here.
 */
const mattePalette = [
  "#8fa98f", // sage
  "#7f96a8", // slate blue
  "#a8859b", // plum
  "#6f9a92", // teal
  "#b3a06f", // sand
  "#c08a72", // terracotta
] as const;

function hash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable presence color for a user, independent of their display name. */
export function presenceColor(userId: string): string {
  return mattePalette[hash(`${userId}:presence`) % mattePalette.length];
}
