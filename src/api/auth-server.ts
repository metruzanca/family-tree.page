"use server";

import { eq } from "drizzle-orm";
import { redirect } from "@solidjs/router";
import { db } from "../server/db";
import { users } from "../../drizzle/schema";
import {
  checkRateLimit,
  clearRateLimit,
  endSession,
  findUserByEmail,
  findUserById,
  getOptionalUser,
  hashPassword,
  requireUser,
  sanitizeRedirect,
  startSession,
  toPublicUser,
  verifyPassword,
} from "../server/auth-service";
import { runAction, type ActionResult } from "../server/errors";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "../server/validation";
import type { PublicUser } from "../server/auth-service";

export async function getUser(): Promise<PublicUser | null> {
  return getOptionalUser();
}

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) return new Error(parsed.error.issues[0]?.message ?? "Check your details.");
  const { email, password, redirectTo } = parsed.data;

  if (!checkRateLimit("login", email, 10, 15 * 60_000)) {
    return new Error("Too many attempts. Wait a few minutes and try again.");
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return new Error("Invalid email or password.");
  }

  clearRateLimit("login", email);
  await startSession(user.id);
  throw redirect(sanitizeRedirect(redirectTo, "/trees"));
}

export async function register(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) return new Error(parsed.error.issues[0]?.message ?? "Check your details.");
  const { email, displayName, password, redirectTo } = parsed.data;

  if (!checkRateLimit("register", email, 5, 60 * 60_000)) {
    return new Error("Too many accounts created from this address. Try again later.");
  }

  const existing = await findUserByEmail(email);
  if (existing) return new Error("An account with that email already exists.");

  const passwordHash = await hashPassword(password);
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({ email, displayName, passwordHash })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) return new Error("An account with that email already exists.");
    console.error(error);
    return new Error("Could not create your account. Please try again.");
  }

  await startSession(user.id);
  throw redirect(sanitizeRedirect(redirectTo, "/trees"));
}

export async function logout() {
  await endSession();
  throw redirect("/login");
}

export async function updateProfile(input: {
  displayName: string;
}): Promise<ActionResult<PublicUser>> {
  return runAction(async () => {
    const current = await requireUser();
    const parsed = updateProfileSchema.parse(input);
    const [updated] = await db
      .update(users)
      .set({ displayName: parsed.displayName, updatedAt: new Date() })
      .where(eq(users.id, current.id))
      .returning();
    if (!updated) throw new Error("Account not found.");
    return toPublicUser(updated);
  });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const current = await requireUser();
    const parsed = changePasswordSchema.parse(input);
    const user = await findUserById(current.id);
    if (!user) throw new Error("Account not found.");
    if (!(await verifyPassword(parsed.currentPassword, user.passwordHash))) {
      throw new Error("Your current password is incorrect.");
    }
    const passwordHash = await hashPassword(parsed.newPassword);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return undefined;
  });
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
