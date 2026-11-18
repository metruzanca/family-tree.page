import type { APIEvent } from "@solidjs/start/server";
import { buildGedcom } from "~/lib/gedcom";
import { loadApiTreeData } from "~/server/api/data";
import { toGedcomInput } from "~/server/api/build";
import { checkRateLimit, getOptionalUser } from "~/server/auth-service";
import { requireTreeMember } from "~/server/guards";
import { isUuid } from "~/server/ids";
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

export async function GET(event: APIEvent) {
  const user = await getOptionalUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const treeId = event.params.treeId;
  if (!treeId || !isUuid(treeId)) return new Response("Not found", { status: 404 });

  if (!checkRateLimit("tree-gedcom", user.id, 10, 60 * 60_000)) {
    return new Response("Too many exports. Try again in an hour.", {
      status: 429,
      headers: { "Retry-After": "3600" },
    });
  }

  let access;
  try {
    access = await requireTreeMember(treeId);
  } catch (error) {
    if (error instanceof Response) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }

  try {
    const data = await loadApiTreeData(access.tree);
    const gedcom = buildGedcom({
      ...toGedcomInput(data),
      generatedAt: new Date(),
    });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(gedcom, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileSlug(access.tree.name)}-${date}.ged"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(Buffer.byteLength(gedcom, "utf8")),
      },
    });
  } catch (error) {
    log.error("gedcom.export_failed", { treeId, userId: user.id, error });
    return new Response("The export could not be generated.", { status: 500 });
  }
}
