import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { redirect } from "@solidjs/router";
import { eq } from "drizzle-orm";
import { getRequestIP } from "@solidjs/start/http";
import { db } from "./db";
import { users, type User } from "../../drizzle/schema";
import { getCurrentPath, getSession } from "./session";

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = await deriveKey(password, Buffer.from(salt, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email)).limit(1).then(rows => rows[0] ?? null);
}

export async function findUserById(id: string) {
  return db.select().from(users).where(eq(users.id, id)).limit(1).then(rows => rows[0] ?? null);
}

export async function getOptionalUser(): Promise<PublicUser | null> {
  const session = await getSession();
  const userId = session.data.userId;
  if (!userId) return null;
  const user = await findUserById(userId);
  if (!user) {
    await session.update({ userId: undefined });
    return null;
  }
  return toPublicUser(user);
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getOptionalUser();
  if (!user) {
    throw redirect(`/login?redirectTo=${encodeURIComponent(getCurrentPath())}`);
  }
  return user;
}

export async function startSession(userId: string) {
  const session = await getSession();
  await session.update({ userId });
}

export async function endSession() {
  const session = await getSession();
  await session.clear();
}

type RateLimitEntry = { count: number; resetAt: number };
const rateLimits = new Map<string, RateLimitEntry>();

function clientKey(scope: string, identity: string) {
  let ip = "unknown";
  try {
    ip = getRequestIP() ?? "unknown";
  } catch {
    // Not in a request context.
  }
  return `${scope}:${ip}:${identity.toLowerCase()}`;
}

export function checkRateLimit(scope: string, identity: string, limit = 10, windowMs = 15 * 60_000) {
  const key = clientKey(scope, identity);
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  if (current.count > limit) return false;
  return true;
}

export function clearRateLimit(scope: string, identity: string) {
  rateLimits.delete(clientKey(scope, identity));
}

export function sanitizeRedirect(path: unknown, fallback = "/trees") {
  if (typeof path !== "string") return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("\\") || /[\u0000-\u001f]/.test(path)) return fallback;
  return path;
}
