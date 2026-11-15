import type { APIEvent } from "@solidjs/start/server";
import { getOptionalUser } from "../../../../server/auth-service";
import { getFileWithAccess } from "../../../../server/file-service";
import { getObjectStream } from "../../../../server/storage";

export async function GET({ params }: APIEvent) {
  const user = await getOptionalUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const access = await getFileWithAccess(params.id, user.id);
  if (!access || access.file.status !== "ready" || !access.file.thumbKey) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const object = await getObjectStream(access.file.thumbKey);
    const headers = new Headers({
      "Content-Type": access.file.thumbMime || "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    if (object.contentLength) headers.set("Content-Length", String(object.contentLength));
    if (object.etag) headers.set("ETag", object.etag);
    return new Response(object.stream, { headers });
  } catch (error) {
    console.error("Could not read thumbnail", error);
    return new Response("Not found", { status: 404 });
  }
}
