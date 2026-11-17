import type { FaceDetector } from "@mediapipe/tasks-vision";
import type { DetectedFace } from "./face-box";
import { clampFaceBox } from "./face-box";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

/** Served from `public/`, so it is a plain stable URL in dev and production. */
const MODEL_URL = "/models/blaze_face_full_range.tflite";

/** Matches the request size the thumbnail is generated at. */
const MIN_CONFIDENCE = 0.35;
const MAX_FACES = 25;
const MIN_BOX_SIDE = 0.02;

let detectorPromise: Promise<FaceDetector> | null = null;

function canRun() {
  return (
    typeof window !== "undefined" &&
    typeof WebAssembly === "object" &&
    typeof createImageBitmap === "function"
  );
}

async function createDetector() {
  const { FaceDetector } = await import("@mediapipe/tasks-vision");
  return FaceDetector.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_CONFIDENCE,
      minSuppressionThreshold: 0.3,
    },
  );
}

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch(error => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

/** True when this browser has the APIs the detector needs. */
export function supportsFaceDetection() {
  return canRun();
}

/**
 * Finds faces in an image blob and returns boxes normalized to the image, so
 * they can be applied to the original at any size. Detection never throws:
 * an unsupported browser or a bad image simply yields no faces.
 */
export async function detectFaces(blob: Blob): Promise<DetectedFace[]> {
  if (!canRun()) return [];

  let bitmap: ImageBitmap | null = null;
  try {
    const detector = await getDetector();
    bitmap = await createImageBitmap(blob);
    if (!bitmap.width || !bitmap.height) return [];

    const result = detector.detect(bitmap);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const minSide = longEdge * MIN_BOX_SIDE;

    const faces = result.detections
      .filter(detection => {
        const box = detection.boundingBox;
        if (!box) return false;
        return (
          box.width >= minSide &&
          box.height >= minSide &&
          box.width <= bitmap!.width &&
          box.height <= bitmap!.height
        );
      })
      .map(detection => {
        const box = detection.boundingBox!;
        return {
          box: clampFaceBox({
            x: box.originX / bitmap!.width,
            y: box.originY / bitmap!.height,
            width: box.width / bitmap!.width,
            height: box.height / bitmap!.height,
          }),
          confidence: detection.categories[0]?.score ?? null,
        };
      })
      .filter(face => face.box.width > 0 && face.box.height > 0)
      .sort((a, b) => a.box.x - b.box.x)
      .slice(0, MAX_FACES);

    return faces;
  } catch (error) {
    if (import.meta.env.DEV) {
      // A missing model or unsupported browser should not fail an upload.
      console.warn("Face detection failed.", error);
    }
    return [];
  } finally {
    bitmap?.close();
  }
}
