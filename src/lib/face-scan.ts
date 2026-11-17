import { recordFileFaces } from "~/api/faces-server";
import { friendlyMessage } from "./action-result";
import { detectFaces, supportsFaceDetection } from "./face-detect";

export type FaceScanResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Runs the local detector and stores the boxes. The server only ever sees
 * normalized geometry, never the image.
 */
export async function scanBlobForFaces(input: {
  treeId: string;
  fileId: string;
  blob: Blob;
}): Promise<FaceScanResult> {
  if (!supportsFaceDetection()) {
    return {
      ok: false,
      error: "This browser cannot check for faces. Tag people instead.",
    };
  }

  const faces = await detectFaces(input.blob);
  try {
    const result = await recordFileFaces({
      treeId: input.treeId,
      fileId: input.fileId,
      faces,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, count: result.data.count };
  } catch (error) {
    return { ok: false, error: friendlyMessage(error) };
  }
}

/** Fetches the 640 px thumbnail the detector runs on. */
export async function scanFileForFaces(
  treeId: string,
  fileId: string,
): Promise<FaceScanResult> {
  try {
    const response = await fetch(`/api/files/${fileId}/thumb`);
    if (!response.ok) return { ok: false, error: "Could not load that photo." };
    const blob = await response.blob();
    return scanBlobForFaces({ treeId, fileId, blob });
  } catch (error) {
    return { ok: false, error: friendlyMessage(error) };
  }
}
