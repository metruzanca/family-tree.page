import { createHash } from "node:crypto";
import type { APIEvent } from "@solidjs/start/server";
import spec from "../../../../openapi/roots-v1.json";

const body = JSON.stringify(spec);
const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;

export function GET(event: APIEvent) {
  const request = event.request;
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
  });
  if (request.headers.get("if-none-match")?.split(",").some(value => value.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}
