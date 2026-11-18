import { buildGedcom } from "~/lib/gedcom";
import { loadApiTreeData } from "~/server/api/data";
import { toGedcomInput } from "~/server/api/build";
import {
  ApiError,
  apiHandler,
  apiOptions,
  requireTokenTree,
} from "~/server/api/http";
import { checkRateLimit } from "~/server/auth-service";
import { log } from "~/server/logger";

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
  const gedcom = buildGedcom({
    ...toGedcomInput(data),
    generatedAt: new Date(),
  });
  const date = new Date().toISOString().slice(0, 10);

  try {
    return new Response(gedcom, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileSlug(tree.name)}-${date}.ged"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(Buffer.byteLength(gedcom, "utf8")),
      },
    });
  } catch (error) {
    log.error("api.gedcom_export_failed", { treeId: tree.id, error });
    throw new ApiError(
      500,
      "The export could not be generated.",
      "internal_error",
    );
  }
});

export const OPTIONS = apiOptions;
