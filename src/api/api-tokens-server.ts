"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { apiTokens, type ApiToken } from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import {
  AppError,
  runAction,
  userMessage,
  type ActionResult,
} from "../server/errors";
import { checkRateLimit } from "../server/auth-service";
import { generateApiToken, hashApiToken } from "../lib/api-token";
import { apiTokenRevokeSchema, apiTokenSchema } from "../server/validation";
import type { ApiScope } from "../lib/api";

export type ApiTokenView = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiScope[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type CreatedApiToken = ApiTokenView & {
  /** Shown once. Only the hash is stored. */
  token: string;
};

function toView(token: ApiToken): ApiTokenView {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
  };
}

export async function getTreeApiTokens(treeId: string): Promise<ApiTokenView[]> {
  await requireTreeMember(treeId, "owner");
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.treeId, treeId))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toView);
}

export async function createTreeApiToken(input: {
  treeId: string;
  name: string;
  expiresInDays?: number | null;
  scopes: ApiScope[];
}): Promise<ActionResult<CreatedApiToken>> {
  return runAction("apiTokens.create", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const parsed = apiTokenSchema.parse(input);
    if (!checkRateLimit("api-token-create", access.user.email, 20, 60 * 60_000)) {
      throw new AppError(userMessage("apiToken.error.rateLimited"));
    }

    const generated = generateApiToken();
    const expiresAt = parsed.expiresInDays
      ? new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60_000)
      : null;

    const [created] = await db
      .insert(apiTokens)
      .values({
        treeId: access.tree.id,
        userId: access.user.id,
        name: parsed.name,
        tokenHash: hashApiToken(generated.token),
        tokenPrefix: generated.prefix,
        scopes: parsed.scopes,
        expiresAt,
      })
      .returning();

    return {
      ...toView(created),
      token: generated.token,
    };
  });
}

export async function revokeTreeApiToken(input: {
  treeId: string;
  tokenId: string;
}): Promise<ActionResult<undefined>> {
  return runAction("apiTokens.revoke", async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const parsed = apiTokenRevokeSchema.parse(input);
    const [updated] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiTokens.id, parsed.tokenId),
          eq(apiTokens.treeId, access.tree.id),
          eq(apiTokens.userId, access.user.id),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id });
    if (!updated) throw new AppError(userMessage("apiToken.error.inactive"));
    return undefined;
  });
}
