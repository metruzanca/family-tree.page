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
import {
  AppError,
  runAction,
  userMessage,
  validationMessage,
  type ActionResult,
} from "../server/errors";
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
import { log } from "../server/logger";

export async function getUser(): Promise<PublicUser | null> {
  return getOptionalUser();
}

export async function login(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo") ?? undefined,
  });
  if (!parsed.success) {
    log.warn("auth.login_rejected", { reason: "validation" });
    return new Error(validationMessage(parsed.error));
  }
  const { email, password, redirectTo } = parsed.data;

  if (!checkRateLimit("login", email, 10, 15 * 60_000)) {
    log.warn("auth.login_rejected", { reason: "rate_limited" });
    return new Error(userMessage("auth.error.tooManyAttempts"));
  }

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    log.warn("auth.login_rejected", { reason: "bad_credentials", userId: user?.id });
    return new Error(userMessage("auth.error.invalidCredentials"));
  }

  clearRateLimit("login", email);
  log.info("auth.login_succeeded", { userId: user.id });
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
  if (!parsed.success) {
    log.warn("auth.register_rejected", { reason: "validation" });
    return new Error(validationMessage(parsed.error));
  }
  const { email, displayName, password, redirectTo } = parsed.data;

  if (!checkRateLimit("register", email, 5, 60 * 60_000)) {
    log.warn("auth.register_rejected", { reason: "rate_limited" });
    return new Error(userMessage("auth.error.registerRateLimited"));
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    log.warn("auth.register_rejected", { reason: "duplicate_account" });
    return new Error(userMessage("auth.error.emailTaken"));
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({ email, displayName, passwordHash })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      log.warn("auth.register_rejected", { reason: "duplicate_account" });
      return new Error(userMessage("auth.error.emailTaken"));
    }
    log.error("auth.register_failed", { error });
    return new Error(userMessage("auth.error.registerFailed"));
  }

  try {
    const sent = await sendVerificationEmail(user);
    if (!sent.delivered && !sent.simulated) {
      log.warn("auth.verification_email_failed", { userId: user.id, reason: sent.reason });
    }
  } catch (error) {
    log.error("auth.verification_email_failed", { userId: user.id, error });
  }

  log.info("auth.register_succeeded", { userId: user.id });
  await startSession(user.id);
  throw redirect(sanitizeRedirect(redirectTo, "/trees"));
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    log.warn("auth.password_reset_rejected", { reason: "validation" });
    return new Error(validationMessage(parsed.error, "validation.emailRequired"));
  }
  const { email } = parsed.data;

  if (!checkRateLimit("forgot-password", email, 5, 60 * 60_000)) {
    log.warn("auth.password_reset_rejected", { reason: "rate_limited" });
    return new Error(userMessage("auth.error.resetRateLimited"));
  }

  const user = await findUserByEmail(email);
  if (user) {
    try {
      const sent = await sendPasswordResetEmail(user);
      if (!sent.delivered && !sent.simulated) {
        log.warn("auth.password_reset_email_failed", { userId: user.id, reason: sent.reason });
      }
    } catch (error) {
      log.error("auth.password_reset_email_failed", { userId: user.id, error });
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
  if (!parsed.success) return new Error(validationMessage(parsed.error));
  const { token, password } = parsed.data;

  if (!checkRateLimit("reset-password", "reset", 15, 15 * 60_000)) {
    return new Error(userMessage("auth.error.tooManyAttempts"));
  }

  const state = await validateAuthToken(token, "password_reset");
  if (state.status !== "ok") {
    if (state.status === "expired") {
      return new Error(userMessage("auth.error.resetExpired"));
    }
    if (state.status === "used") return new Error(userMessage("auth.error.resetUsed"));
    return new Error(userMessage("auth.error.resetInvalid"));
  }

  const user = await findUserById(state.userId);
  if (!user) return new Error(userMessage("auth.error.resetInvalid"));

  const passwordHash = await hashPassword(password);
  const claimed = await markTokenUsed(state.tokenId);
  if (!claimed) return new Error(userMessage("auth.error.resetUsed"));
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
    if (current.emailVerified) throw new AppError(userMessage("auth.error.alreadyVerified"));
    if (!checkRateLimit("verification-email", current.email, 3, 60 * 60_000)) {
      throw new AppError(userMessage("auth.error.verificationRateLimited"));
    }
    const user = await findUserById(current.id);
    if (!user) throw new AppError(userMessage("auth.error.accountNotFound"));
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
    if (!updated) throw new Error(userMessage("auth.error.accountNotFound"));
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
    if (!updated) throw new Error(userMessage("auth.error.accountNotFound"));
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
    if (!user) throw new Error(userMessage("auth.error.accountNotFound"));
    if (!(await verifyPassword(parsed.currentPassword, user.passwordHash))) {
      throw new Error(userMessage("auth.error.currentPasswordIncorrect"));
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
