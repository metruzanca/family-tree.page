import { createHash } from "node:crypto";
import { loadApiTreeData } from "~/server/api/data";
import { buildExportSnapshot } from "~/server/api/build";
import {
  ApiError,
  apiHandler,
  apiOptions,
  etagMatches,
  notModified,
  requireTokenTree,
} from "~/server/api/http";
import { searchParam } from "~/server/api/query";
import { checkRateLimit } from "~/server/auth-service";
import { publicOrigin } from "~/server/config";

function fileSlug(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "family-tree"
  );
}

export const GET = apiHandler("export:read", async (event, context) => {
  const tree = requireTokenTree(event, context);
  if (!checkRateLimit("api-export", context.token.id, 10, 60 * 60_000)) {
    throw new ApiError(
      429,
      "Exports are limited to 10 per hour per token.",
      "rate_limited",
    );
  }

  const data = await loadApiTreeData(tree);
  const snapshot = buildExportSnapshot(data, publicOrigin());
  // generatedAt changes on every request, so it is excluded from the version
  // hash. Otherwise revalidation would never succeed.
  const { generatedAt: _generatedAt, ...stable } = snapshot;
  const etag = `"${createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 32)}"`;
  const body = JSON.stringify(snapshot);

  if (etagMatches(event.request, etag)) return notModified(etag);

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (searchParam(event.request, "download") === "1") {
    const date = new Date().toISOString().slice(0, 10);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileSlug(tree.name)}-${date}.json"`,
    );
  }
  return new Response(body, { headers });
});

export const OPTIONS = apiOptions;
