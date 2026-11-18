import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  apiTokens,
  treeMembers,
  trees,
  users,
  type ApiToken,
  type Tree,
  type User,
} from "../../drizzle/schema";
import { API_TOKEN_PREFIX, hashApiToken } from "../lib/api-token";

export type ApiPrincipal = {
  token: ApiToken;
  user: User;
  tree: Tree;
};

export type ApiTokenFailure = {
  ok: false;
  code: "missing_token" | "invalid_token" | "token_revoked" | "token_expired";
  message: string;
};

export type ApiTokenResult =
  | { ok: true; principal: ApiPrincipal }
  | ApiTokenFailure;

const LAST_USED_WRITE_MS = 60_000;

/**
 * Resolves a bearer token to the user and tree it can read. Membership is
 * checked on every request, so leaving a tree immediately disables its tokens.
 */
export async function resolveApiToken(raw: string): Promise<ApiTokenResult> {
  if (!raw || raw.length > 200 || !raw.startsWith(API_TOKEN_PREFIX)) {
    return {
      ok: false,
      code: "invalid_token",
      message: "That API token is not valid.",
    };
  }

  const rows = await db
    .select({
      token: apiTokens,
      user: users,
      tree: trees,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .innerJoin(trees, eq(trees.id, apiTokens.treeId))
    .innerJoin(
      treeMembers,
      and(
        eq(treeMembers.treeId, apiTokens.treeId),
        eq(treeMembers.userId, apiTokens.userId),
      ),
    )
    .where(and(eq(apiTokens.tokenHash, hashApiToken(raw)), isNull(trees.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      code: "invalid_token",
      message: "That API token is not valid.",
    };
  }
  if (row.token.revokedAt) {
    return {
      ok: false,
      code: "token_revoked",
      message: "That API token has been revoked.",
    };
  }
  if (row.token.expiresAt && row.token.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      code: "token_expired",
      message: "That API token has expired.",
    };
  }

  const lastUsed = row.token.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsed > LAST_USED_WRITE_MS) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.token.id))
      .catch(() => undefined);
  }

  return { ok: true, principal: row };
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}
