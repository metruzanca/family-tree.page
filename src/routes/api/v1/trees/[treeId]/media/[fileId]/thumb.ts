import {
  apiHandler,
  apiOptions,
  notFound,
  requireTokenTree,
} from "~/server/api/http";
import { loadApiMediaFile } from "~/server/api/media";
import { log } from "~/server/logger";
import { getObjectStream } from "~/server/storage";

export const GET = apiHandler("media:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const fileId = event.params.fileId;
  if (!fileId) throw notFound("That file is not in this tree.");

  const file = await loadApiMediaFile(tree.id, fileId);
  if (!file || !file.thumbKey) throw notFound("That preview is not available.");

  try {
    const object = await getObjectStream(file.thumbKey);
    const headers = new Headers({
      "Content-Type": file.thumbMime || "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.contentLength) headers.set("Content-Length", String(object.contentLength));
    if (object.etag) headers.set("ETag", object.etag);
    return new Response(object.stream, { headers });
  } catch (error) {
    log.error("api.media_thumb_failed", { treeId: tree.id, fileId, error });
    throw notFound("That preview is not available.");
  }
});

export const OPTIONS = apiOptions;
