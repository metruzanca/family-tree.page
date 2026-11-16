import { cancelUpload, finalizeUpload, prepareUpload } from "~/api/files-server";
import { friendlyMessage } from "./action-result";
import { formatExifDate } from "./exif";
import { exactDateFromISO } from "./fuzzy-date";
import { makeThumbnail, mimeForFile } from "./image-thumb";

export type UploadOptions = {
  treeId: string;
  personId: string;
  groupId?: string | null;
  file: File;
  onProgress?: (fraction: number) => void;
};

export type UploadResult = { ok: true; fileId: string } | { ok: false; error: string };

export async function uploadPersonFile(options: UploadOptions): Promise<UploadResult> {
  const mimeType = mimeForFile(options.file);
  options.onProgress?.(0.02);

  let thumb: Awaited<ReturnType<typeof makeThumbnail>> = null;
  if (mimeType.startsWith("image/")) {
    thumb = await makeThumbnail(options.file).catch(() => null);
    if ((mimeType === "image/heic" || mimeType === "image/heif") && !thumb) {
      return {
        ok: false,
        error: "This phone photo format cannot be converted here. Export it as a JPEG first.",
      };
    }
  }

  const takenAt = mimeType.startsWith("image/")
    ? exactDateFromISO(await readTakenAt(options.file))
    : null;

  let prepared: Awaited<ReturnType<typeof prepareUpload>>;
  try {
    prepared = await prepareUpload({
      treeId: options.treeId,
      personId: options.personId,
      groupId: options.groupId ?? null,
      fileName: options.file.name,
      mimeType,
      sizeBytes: options.file.size,
      thumbMime: thumb?.mime ?? null,
      width: thumb?.width ?? null,
      height: thumb?.height ?? null,
      takenAt,
    });
  } catch (error) {
    return { ok: false, error: friendlyMessage(error) };
  }

  if (!prepared.ok) return { ok: false, error: prepared.error };
  options.onProgress?.(0.08);

  const { fileId, original, thumb: thumbTarget } = prepared.data;
  try {
    const thumbShare = thumb && thumbTarget ? 0.12 : 0;
    if (thumb && thumbTarget) {
      const thumbFile = new File([thumb.blob], "thumb", { type: thumb.mime });
      await postForm(
        thumbTarget.url,
        thumbTarget.fields,
        thumbFile,
        thumbTarget.contentType,
        fraction => {
          options.onProgress?.(0.08 + fraction * thumbShare);
        },
      );
    }
    await postForm(
      original.url,
      original.fields,
      options.file,
      original.contentType,
      fraction => {
        options.onProgress?.(0.2 + fraction * (0.72 - thumbShare));
      },
    );

    options.onProgress?.(0.94);
    const finalized = await finalizeUpload(fileId);
    if (!finalized.ok) {
      await cancelUpload(fileId);
      return { ok: false, error: finalized.error };
    }
    options.onProgress?.(1);
    return { ok: true, fileId };
  } catch (error) {
    await cancelUpload(fileId).catch(() => undefined);
    return {
      ok: false,
      error: friendlyMessage(error),
    };
  }
}

async function readTakenAt(file: File) {
  try {
    const { default: exifr } = await import("exifr");
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate"],
      reviveValues: false,
    });
    if (!data) return null;
    return (
      formatExifDate(data.DateTimeOriginal) ?? formatExifDate(data.CreateDate) ?? null
    );
  } catch {
    return null;
  }
}

function postForm(
  url: string,
  fields: Record<string, string>,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (!fields["Content-Type"]) form.append("Content-Type", contentType);
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("Could not reach file storage."));
    request.onabort = () => reject(new Error("Upload cancelled."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage rejected the upload (${request.status}).`));
      }
    };
    request.send(form);
  });
}
