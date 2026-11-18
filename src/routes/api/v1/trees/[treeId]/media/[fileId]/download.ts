import {
  apiHandler,
  apiOptions,
  notFound,
  requireTokenTree,
} from "~/server/api/http";
import { loadApiMediaFile } from "~/server/api/media";
import { log } from "~/server/logger";
import { presignDownload } from "~/server/storage";

export const GET = apiHandler("media:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  const fileId = event.params.fileId;
  if (!fileId) throw notFound("That file is not in this tree.");

  const file = await loadApiMediaFile(tree.id, fileId);
  if (!file) throw notFound("That file is not in this tree.");

  const inline =
    file.kind === "image" &&
    new URL(event.request.url).searchParams.get("inline") === "1";

  try {
    const signed = await presignDownload(file.storageKey, {
      fileName: file.originalName,
      contentType: file.mimeType,
      inline,
      expiresIn: 300,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: signed, "Cache-Control": "no-store" },
    });
  } catch (error) {
    log.error("api.media_download_failed", { treeId: tree.id, fileId, error });
    throw notFound("That file is not available.");
  }
});

export const OPTIONS = apiOptions;
