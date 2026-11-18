import { tClient } from "../i18n";

export type Thumbnail = {
  blob: Blob;
  mime: "image/webp" | "image/jpeg";
  width: number;
  height: number;
};

export async function makeThumbnail(file: File): Promise<Thumbnail | null> {
  if (!file.type.startsWith("image/")) return null;
  const source = await loadImage(file);
  if (!source) return null;

  try {
    const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
    const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);

    let blob = await canvasBlob(canvas, "image/webp", 0.82);
    let mime: "image/webp" | "image/jpeg" = "image/webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasBlob(canvas, "image/jpeg", 0.84);
      mime = "image/jpeg";
    }
    if (!blob) return null;
    return { blob, mime, width: sourceWidth, height: sourceHeight };
  } catch {
    return null;
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari and some formats need the <img> fallback.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(tClient("media.error.imageReadFailed")));
      if (image.complete && image.naturalWidth > 0) resolve();
    });
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mimeForFile(file: File) {
  if (file.type) return file.type.split(";")[0].toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    rtf: "application/rtf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
  };
  return extension ? (map[extension] ?? "application/octet-stream") : "application/octet-stream";
}
