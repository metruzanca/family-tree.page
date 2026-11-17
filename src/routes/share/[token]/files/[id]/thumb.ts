import type { APIEvent } from "@solidjs/start/server";
import { log } from "../../../../../server/logger";
import { getSharedImage } from "../../../../../api/share-server";
import { getObjectStream } from "../../../../../server/storage";

export async function GET({ params }: APIEvent) {
  const image = await getSharedImage(params.token, params.id);
  if (!image) return new Response("Not found", { status: 404 });

  try {
    const object = await getObjectStream(image.thumbKey);
    const headers = new Headers({
      "Content-Type": image.thumbMime || "image/webp",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    if (object.contentLength) headers.set("Content-Length", String(object.contentLength));
    if (object.etag) headers.set("ETag", object.etag);
    return new Response(object.stream, { headers });
  } catch (error) {
    log.error("share.thumbnail_failed", { fileId: params.id, error });
    return new Response("Not found", { status: 404 });
  }
}
