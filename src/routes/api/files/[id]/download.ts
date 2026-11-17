import { log } from "../../../../server/logger";
import type { APIEvent } from "@solidjs/start/server";
import { getOptionalUser } from "../../../../server/auth-service";
import { getFileWithAccess } from "../../../../server/file-service";
import { presignDownload } from "../../../../server/storage";

export async function GET({ params, request }: APIEvent) {
  const user = await getOptionalUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const access = await getFileWithAccess(params.id, user.id);
  if (!access || access.file.status !== "ready") {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const inline = access.file.kind === "image" && url.searchParams.get("inline") === "1";
  try {
    const signed = await presignDownload(access.file.storageKey, {
      fileName: access.file.originalName,
      contentType: access.file.mimeType,
      inline,
      expiresIn: 300,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: signed, "Cache-Control": "no-store" },
    });
  } catch (error) {
    log.error("files.download_url_failed", { fileId: params.id, error });
    return new Response("Not found", { status: 404 });
  }
}
