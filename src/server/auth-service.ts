import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { redirect } from "@solidjs/router";
import { eq, sql } from "drizzle-orm";
import { getRequestIP } from "@solidjs/start/http";
import { db } from "./db";
import { users, type User } from "../../drizzle/schema";
import { getCurrentPath, getSession } from "./session";
import { publicOrigin } from "./config";
import { setLogContext } from "./logger";
import { sendEmail, type SendEmailResult } from "./email";
import { passwordResetMessage, verifyEmailMessage } from "./email-templates";
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  issueAuthToken,
  markTokenUsed,
  validateAuthToken,
} from "./tokens";

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
  emailVerified: boolean;
  notifyBirthdayWeekBefore: boolean;
  notifyBirthdayDayBefore: boolean;
  notifyBirthdayDayOf: boolean;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: Boolean(user.emailVerifiedAt),
    notifyBirthdayWeekBefore: user.notifyBirthdayWeekBefore,
    notifyBirthdayDayBefore: user.notifyBirthdayDayBefore,
    notifyBirthdayDayOf: user.notifyBirthdayDayOf,
  };
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
  if ((session.data.sessionVersion ?? 0) !== user.sessionVersion) {
    await session.update({ userId: undefined, sessionVersion: undefined });
    return null;
  }
  setLogContext({ userId: user.id });
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
  const user = await findUserById(userId);
  if (!user) throw new Error("Account not found.");
  const session = await getSession();
  await session.update({ userId: user.id, sessionVersion: user.sessionVersion });
}

export async function endSession() {
  const session = await getSession();
  await session.clear();
}

export async function sendVerificationEmail(user: User): Promise<SendEmailResult> {
  if (user.emailVerifiedAt) return { delivered: false, reason: "failed" };
  const { token } = await issueAuthToken(
    user.id,
    "email_verification",
    EMAIL_VERIFICATION_TTL_MS,
  );
  const url = `${publicOrigin()}/verify-email/${token}`;
  return sendEmail(
    user.email,
    verifyEmailMessage({
      name: user.displayName,
      url,
      expiresInHours: Math.round(EMAIL_VERIFICATION_TTL_MS / 3_600_000),
    }),
  );
}

export type VerifyEmailOutcome =
  | { status: "verified" }
  | { status: "already" }
  | { status: "invalid" | "expired" };

export async function verifyEmailToken(token: string): Promise<VerifyEmailOutcome> {
  const state = await validateAuthToken(token, "email_verification");
  if (state.status === "used") {
    const user = await findUserById(state.userId);
    return { status: user?.emailVerifiedAt ? "already" : "invalid" };
  }
  if (state.status !== "ok") {
    return { status: state.status === "missing" ? "invalid" : state.status };
  }
  const user = await findUserById(state.userId);
  if (!user) return { status: "invalid" };
  if (user.emailVerifiedAt) {
    await markTokenUsed(state.tokenId);
    return { status: "already" };
  }
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await markTokenUsed(state.tokenId);
  return { status: "verified" };
}

export async function sendPasswordResetEmail(user: User): Promise<SendEmailResult> {
  const { token } = await issueAuthToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
  const url = `${publicOrigin()}/reset-password/${token}`;
  return sendEmail(
    user.email,
    passwordResetMessage({
      name: user.displayName,
      url,
      expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60_000),
    }),
  );
}

export async function bumpSessionVersion(userId: string): Promise<number> {
  const [updated] = await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion });
  if (!updated) throw new Error("Account not found.");
  return updated.sessionVersion;
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
