import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { authTokens } from "../../drizzle/schema";

export type AuthTokenKind = "email_verification" | "password_reset" | "email_change";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60_000;

export function generateToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 200;
}

export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  ttlMs: number,
  options: { pendingEmail?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.transaction(async tx => {
    // Only the newest link per kind stays valid.
    await tx
      .delete(authTokens)
      .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind)));
    await tx.insert(authTokens).values({
      userId,
      kind,
      pendingEmail: options.pendingEmail ?? null,
      tokenHash: hashToken(token),
      expiresAt,
    });
  });

  return { token, expiresAt };
}

export type AuthTokenState =
  | { status: "ok"; userId: string; tokenId: string; pendingEmail: string | null }
  | { status: "missing" | "expired" }
  | { status: "used"; userId: string; tokenId: string; pendingEmail: string | null };

export async function validateAuthToken(
  token: unknown,
  kind: AuthTokenKind,
): Promise<AuthTokenState> {
  if (!isPlausibleToken(token)) return { status: "missing" };
  const rows = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.kind, kind)))
    .limit(1);
  const record = rows[0];
  if (!record) return { status: "missing" };
  if (record.usedAt) {
    return {
      status: "used",
      userId: record.userId,
      tokenId: record.id,
      pendingEmail: record.pendingEmail,
    };
  }
  if (record.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  return {
    status: "ok",
    userId: record.userId,
    tokenId: record.id,
    pendingEmail: record.pendingEmail,
  };
}

export async function markTokenUsed(tokenId: string): Promise<boolean> {
  const updated = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, tokenId), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  return updated.length > 0;
}
