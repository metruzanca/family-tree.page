"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../server/db";
import {
  treeShareLinks,
  trees,
  people,
  type TreeShareLink,
} from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import {
  AppError,
  runAction,
  userMessage,
  type ActionResult,
} from "../server/errors";
import { checkRateLimit } from "../server/auth-service";
import { log } from "../server/logger";
import { publicOrigin } from "../server/config";
import { getFileById } from "../server/file-service";
import { loadTreeGraph, type TreeGraph } from "./people-server";
import {
  sanitizeSharedGraph,
  type LivingVisibility,
} from "../lib/share";
import { shareLinkSchema } from "../server/validation";

export type TreeShareLinkView = {
  id: string;
  label: string;
  livingVisibility: LivingVisibility;
  includeMedia: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  createdAt: Date;
};

export type CreatedTreeShareLink = TreeShareLinkView & {
  url: string;
};

function shareUrl(token: string) {
  return `${publicOrigin()}/share/${token}`;
}

function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toView(
  link: Pick<
    TreeShareLink,
    | "id"
    | "label"
    | "livingVisibility"
    | "includeMedia"
    | "expiresAt"
    | "revokedAt"
    | "lastAccessedAt"
    | "createdAt"
  >,
): TreeShareLinkView {
  return {
    id: link.id,
    label: link.label,
    livingVisibility: link.livingVisibility,
    includeMedia: link.includeMedia,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    lastAccessedAt: link.lastAccessedAt,
    createdAt: link.createdAt,
  };
}

export async function getTreeShareLinks(treeId: string): Promise<TreeShareLinkView[]> {
  await requireTreeMember(treeId, "owner");
  const rows = await db
    .select()
    .from(treeShareLinks)
    .where(eq(treeShareLinks.treeId, treeId))
    .orderBy(desc(treeShareLinks.createdAt));
  return rows.map(toView);
}

export async function createTreeShareLink(input: {
  treeId: string;
  label?: string | null;
  livingVisibility?: LivingVisibility;
  includeMedia?: boolean;
  expiresInDays?: number | null;
}): Promise<ActionResult<CreatedTreeShareLink>> {
  return runAction("share.createLink", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const parsed = shareLinkSchema.parse(input);
    if (!checkRateLimit("share-create", access.user.email, 20, 60 * 60_000)) {
      throw new AppError(userMessage("share.error.rateLimited"));
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60_000)
      : null;

    const [created] = await db
      .insert(treeShareLinks)
      .values({
        treeId: access.tree.id,
        tokenHash: hashShareToken(token),
        label: parsed.label,
        livingVisibility: parsed.livingVisibility,
        includeMedia: parsed.includeMedia,
        createdBy: access.user.id,
        expiresAt,
      })
      .returning();

    return {
      ...toView(created),
      url: shareUrl(token),
    };
  });
}

export async function revokeTreeShareLink(input: {
  treeId: string;
  linkId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("share.revokeLink", async () => {
    await requireTreeMember(input.treeId, "owner");
    const [updated] = await db
      .update(treeShareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(treeShareLinks.id, input.linkId),
          eq(treeShareLinks.treeId, input.treeId),
          isNull(treeShareLinks.revokedAt),
        ),
      )
      .returning({ id: treeShareLinks.id });
    if (!updated) throw new AppError(userMessage("share.error.inactive"));
    return undefined;
  });
}

export type SharedTree = {
  graph: TreeGraph;
  share: {
    label: string;
    livingVisibility: LivingVisibility;
    includeMedia: boolean;
  };
};

export async function getSharedTree(token: string): Promise<SharedTree | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashShareToken(token);
  if (!checkRateLimit("share-view", tokenHash.slice(0, 16), 120, 60_000)) {
    return null;
  }

  const rows = await db
    .select({
      id: treeShareLinks.id,
      label: treeShareLinks.label,
      livingVisibility: treeShareLinks.livingVisibility,
      includeMedia: treeShareLinks.includeMedia,
      expiresAt: treeShareLinks.expiresAt,
      revokedAt: treeShareLinks.revokedAt,
      treeId: trees.id,
      treeName: trees.name,
      treeDescription: trees.description,
    })
    .from(treeShareLinks)
    .innerJoin(trees, eq(trees.id, treeShareLinks.treeId))
    .where(and(eq(treeShareLinks.tokenHash, tokenHash), isNull(trees.deletedAt)))
    .limit(1);

  const link = rows[0];
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null;

  const graph = await loadTreeGraph({
    id: link.treeId,
    name: link.treeName,
    description: link.treeDescription,
  });

  const sharedGraph = sanitizeSharedGraph(graph, {
    livingVisibility: link.livingVisibility,
    includeMedia: link.includeMedia,
    thumbUrl: fileId => `/share/${token}/files/${fileId}/thumb`,
  });

  void db
    .update(treeShareLinks)
    .set({ lastAccessedAt: new Date() })
    .where(eq(treeShareLinks.id, link.id))
    .catch(error => log.error("share.last_access_failed", { linkId: link.id, error }));

  return {
    graph: sharedGraph,
    share: {
      label: link.label,
      livingVisibility: link.livingVisibility,
      includeMedia: link.includeMedia,
    },
  };
}

export async function getSharedImage(
  token: string,
  fileId: string,
): Promise<{ thumbKey: string; thumbMime: string | null } | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashShareToken(token);
  const [link] = await db
    .select({
      treeId: treeShareLinks.treeId,
      includeMedia: treeShareLinks.includeMedia,
      livingVisibility: treeShareLinks.livingVisibility,
      expiresAt: treeShareLinks.expiresAt,
      revokedAt: treeShareLinks.revokedAt,
    })
    .from(treeShareLinks)
    .innerJoin(trees, eq(trees.id, treeShareLinks.treeId))
    .where(and(eq(treeShareLinks.tokenHash, tokenHash), isNull(trees.deletedAt)))
    .limit(1);
  if (!link || link.revokedAt || !link.includeMedia) return null;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null;

  const file = await getFileById(fileId);
  if (
    !file ||
    file.treeId !== link.treeId ||
    file.kind !== "image" ||
    file.status !== "ready" ||
    !file.thumbKey
  ) {
    return null;
  }

  // Never serve a thumbnail for a living person unless the owner opted into
  // full details. Inbox files have no person, so they never leave the app.
  if (!file.personId) return null;
  const [person] = await db
    .select({ deathDate: people.deathDate })
    .from(people)
    .where(eq(people.id, file.personId))
    .limit(1);
  if (!person?.deathDate && link.livingVisibility !== "full") return null;

  return { thumbKey: file.thumbKey, thumbMime: file.thumbMime };
}
