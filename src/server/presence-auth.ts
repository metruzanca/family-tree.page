import { and, eq } from "drizzle-orm";
import type { HTTPEvent, SessionConfig } from "nitro/h3";
import { getCookie, unsealSession } from "nitro/h3";
import { db } from "./db";
import { isUuid } from "./ids";
import { SESSION_COOKIE_NAME, sessionConfig } from "./session";
import { treeMembers, users } from "../../drizzle/schema";

export type PresenceIdentity = {
  userId: string;
  displayName: string;
};

/** Read the stateless session cookie from a raw upgrade request. */
async function userIdFromRequest(request: Request): Promise<string | null> {
  const event = { req: request } as unknown as HTTPEvent;
  const sealed = getCookie(event, SESSION_COOKIE_NAME);
  if (!sealed) return null;
  try {
    // unsealSession only reads config and the sealed value, so a minimal event
    // is enough. The cookie stays valid across deploys because the secret is
    // stable and the session carries no server-side state.
    const session = await unsealSession(event, sessionConfig as SessionConfig, sealed);
    const userId = session.data?.userId;
    return typeof userId === "string" ? userId : null;
  } catch {
    return null;
  }
}

export async function authenticatePresence(
  request: Request,
  treeId: string,
): Promise<PresenceIdentity | null> {
  if (!isUuid(treeId) || !isSameOrigin(request)) return null;
  const userId = await userIdFromRequest(request);
  if (!userId) return null;
  const rows = await db
    .select({ displayName: users.displayName })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row ? { userId, displayName: row.displayName } : null;
}

/**
 * Browsers always send Origin on a WebSocket handshake. Reject cross-origin
 * upgrades so another site cannot ride a visitor's session cookie.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("host");
    if (host && originHost === host) return true;
    const appUrl = process.env.APP_URL;
    if (!appUrl) return false;
    return originHost === new URL(appUrl).host;
  } catch {
    return false;
  }
}
