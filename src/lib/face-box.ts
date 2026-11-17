import type { FaceBox } from "../../drizzle/schema";

export type { FaceBox } from "../../drizzle/schema";

export type DetectedFace = {
  box: FaceBox;
  confidence?: number | null;
};

export type MergeableFace = {
  id: string;
  box: FaceBox;
  status: "unassigned" | "assigned" | "ignored";
};

export type FaceRescanPlan = {
  /** Faces the detector found again. Their box and confidence move, their link stays. */
  updates: Array<{ id: string; box: FaceBox; confidence: number | null }>;
  /** Old unassigned boxes the detector no longer sees. */
  removals: string[];
  /** New boxes to insert. */
  additions: DetectedFace[];
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100_000) / 100_000;
}

/**
 * Keeps a box inside the image. Values arrive from the browser, so never trust
 * them to be in range.
 */
export function clampFaceBox(box: FaceBox): FaceBox {
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  const width = clamp(box.width, 0, 1 - x);
  const height = clamp(box.height, 0, 1 - y);
  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
  };
}

export function intersectionOverUnion(a: FaceBox, b: FaceBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * A re-scan should update boxes, not erase the work an editor did. Assigned and
 * ignored faces are kept even when the detector misses them; only stale
 * unassigned detections are dropped.
 */
export function planFaceRescan(
  existing: MergeableFace[],
  detected: DetectedFace[],
  threshold = 0.5,
): FaceRescanPlan {
  const used = new Set<string>();
  const updates: FaceRescanPlan["updates"] = [];
  const additions: DetectedFace[] = [];

  for (const face of detected) {
    let best: MergeableFace | null = null;
    let bestScore = threshold;
    for (const candidate of existing) {
      if (used.has(candidate.id)) continue;
      const score = intersectionOverUnion(candidate.box, face.box);
      if (score >= bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      used.add(best.id);
      updates.push({
        id: best.id,
        box: clampFaceBox(face.box),
        confidence: face.confidence ?? null,
      });
    } else {
      additions.push({ ...face, box: clampFaceBox(face.box) });
    }
  }

  const removals = existing
    .filter(face => !used.has(face.id) && face.status === "unassigned")
    .map(face => face.id);

  return { updates, removals, additions };
}

/**
 * The rectangle an `object-contain` image actually paints inside its element.
 * Faces are positioned against this, not against the letterboxed element.
 */
export function containedImageRect(
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    !Number.isFinite(boxWidth) ||
    !Number.isFinite(boxHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    boxWidth <= 0 ||
    boxHeight <= 0
  ) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: (boxWidth - width) / 2,
    top: (boxHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Pixel geometry for a face chip: a large image offset so the box fills a crop
 * of `size` pixels. The image keeps its aspect ratio.
 */
export function faceCropRect(
  box: FaceBox,
  imageWidth: number,
  imageHeight: number,
  size: number,
) {
  if (!box.width || !box.height || !imageWidth || !imageHeight) {
    return { width: size, height: size, left: 0, top: 0 };
  }
  const width = size / box.width;
  const height = width * (imageHeight / imageWidth);
  return {
    width,
    height,
    left: -box.x * width,
    top: -box.y * height,
  };
}
