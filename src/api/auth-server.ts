"use server";

import { eq } from "drizzle-orm";
import { redirect } from "@solidjs/router";
import { db } from "../server/db";
import { users } from "../../drizzle/schema";
import {
  bumpSessionVersion,
  checkRateLimit,
  clearRateLimit,
  endSession,
  findUserByEmail,
  findUserById,
  getOptionalUser,
  hashPassword,
  requireUser,
  sanitizeRedirect,
  sendPasswordResetEmail,
  sendVerificationEmail,
  startSession,
  toPublicUser,
  verifyEmailToken,
  verifyPassword,
} from "../server/auth-service";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateNotificationSettingsSchema,
  updateProfileSchema,
} from "../server/validation";
import { markTokenUsed, validateAuthToken } from "../server/tokens";
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

  try {
    const sent = await sendVerificationEmail(user);
    if (!sent.delivered && !sent.simulated) {
      console.warn(`Verification email for ${email} was not delivered; the user can resend it later.`);
    }
  } catch (error) {
    console.error("Could not send the verification email", error);
  }

  await startSession(user.id);
  throw redirect(sanitizeRedirect(redirectTo, "/trees"));
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return new Error(parsed.error.issues[0]?.message ?? "Enter your email.");
  const { email } = parsed.data;

  if (!checkRateLimit("forgot-password", email, 5, 60 * 60_000)) {
    return new Error("Too many reset emails requested. Try again in an hour.");
  }

  const user = await findUserByEmail(email);
  if (user) {
    try {
      const sent = await sendPasswordResetEmail(user);
      if (!sent.delivered && !sent.simulated) {
        console.warn(`Password reset email for ${email} was not delivered.`);
      }
    } catch (error) {
      console.error("Could not send the password reset email", error);
    }
  }

  // Always the same response, whether or not the address has an account.
  return { sent: true };
}

export async function resetPassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return new Error(parsed.error.issues[0]?.message ?? "Check your details.");
  const { token, password } = parsed.data;

  if (!checkRateLimit("reset-password", "reset", 15, 15 * 60_000)) {
    return new Error("Too many attempts. Wait a few minutes and try again.");
  }

  const state = await validateAuthToken(token, "password_reset");
  if (state.status !== "ok") {
    if (state.status === "expired") {
      return new Error("This reset link has expired. Request a new one.");
    }
    if (state.status === "used") return new Error("This reset link has already been used.");
    return new Error("That reset link is not valid.");
  }

  const user = await findUserById(state.userId);
  if (!user) return new Error("That reset link is not valid.");

  const passwordHash = await hashPassword(password);
  const claimed = await markTokenUsed(state.tokenId);
  if (!claimed) return new Error("This reset link has already been used.");
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await bumpSessionVersion(user.id);
  clearRateLimit("forgot-password", user.email);
  await startSession(user.id);
  throw redirect("/trees");
}

export async function resendVerificationEmail(): Promise<
  ActionResult<{ delivered: boolean; simulated: boolean }>
> {
  return runAction("auth.resendVerificationEmail", async () => {
    const current = await requireUser();
    if (current.emailVerified) throw new AppError("Your email is already verified.");
    if (!checkRateLimit("verification-email", current.email, 3, 60 * 60_000)) {
      throw new AppError("We just sent a few links. Try again in an hour.");
    }
    const user = await findUserById(current.id);
    if (!user) throw new AppError("Account not found.");
    const result = await sendVerificationEmail(user);
    return { delivered: result.delivered, simulated: Boolean(result.simulated) };
  });
}

export async function verifyEmail(token: string) {
  return verifyEmailToken(token);
}

export async function getPasswordResetPreview(token: string) {
  const state = await validateAuthToken(token, "password_reset");
  return { status: state.status };
}

export async function logout() {
  await endSession();
  throw redirect("/login");
}

export async function updateProfile(input: {
  displayName: string;
}): Promise<ActionResult<PublicUser>> {
  return runAction("auth.updateProfile", async () => {
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

export async function updateNotificationSettings(input: {
  notifyBirthdayWeekBefore: boolean;
  notifyBirthdayDayBefore: boolean;
  notifyBirthdayDayOf: boolean;
}): Promise<ActionResult<PublicUser>> {
  return runAction("auth.updateNotificationSettings", async () => {
    const current = await requireUser();
    const parsed = updateNotificationSettingsSchema.parse(input);
    const [updated] = await db
      .update(users)
      .set({
        notifyBirthdayWeekBefore: parsed.notifyBirthdayWeekBefore,
        notifyBirthdayDayBefore: parsed.notifyBirthdayDayBefore,
        notifyBirthdayDayOf: parsed.notifyBirthdayDayOf,
        updatedAt: new Date(),
      })
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
  return runAction("auth.changePassword", async () => {
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
    // Changing a password signs out every other device.
    await bumpSessionVersion(user.id);
    await startSession(user.id);
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
