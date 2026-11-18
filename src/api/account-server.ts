"use server";

import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "../server/db";
import {
  authTokens,
  treeActivity,
  treeMembers,
  trees,
  users,
} from "../../drizzle/schema";
import {
  checkRateLimit,
  endSession,
  findUserByEmail,
  findUserById,
  getOptionalUser,
  requireUser,
  verifyPassword,
} from "../server/auth-service";
import {
  AppError,
  runAction,
  userMessage,
  type ActionResult,
} from "../server/errors";
import { log } from "../server/logger";
import { deleteAccountSchema, emailChangeSchema } from "../server/validation";
import {
  EMAIL_CHANGE_TTL_MS,
  issueAuthToken,
  markTokenUsed,
  validateAuthToken,
} from "../server/tokens";
import { sendEmail } from "../server/email";
import {
  emailChangeConfirmationMessage,
  emailChangeNoticeMessage,
} from "../server/email-templates";
import { publicOrigin } from "../server/config";
import { deletePrefix, TREE_PREFIX } from "../server/storage";
import { getAccountUsage, type AccountUsage } from "../server/usage";

export async function getUsage(): Promise<AccountUsage> {
  const current = await requireUser();
  return getAccountUsage(current.id);
}

export type PendingEmailChange = {
  newEmail: string;
  expiresAt: Date;
};

export async function getPendingEmailChange(): Promise<PendingEmailChange | null> {
  const current = await requireUser();
  const rows = await db
    .select({ newEmail: authTokens.pendingEmail, expiresAt: authTokens.expiresAt })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, current.id),
        eq(authTokens.kind, "email_change"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authTokens.createdAt))
    .limit(1);

  const pending = rows[0];
  if (!pending?.newEmail) return null;
  return { newEmail: pending.newEmail, expiresAt: pending.expiresAt };
}

export async function requestEmailChange(input: {
  newEmail: string;
  currentPassword: string;
}): Promise<ActionResult<{ emailSent: boolean; emailSimulated: boolean }>> {
  return runAction("account.requestEmailChange", async () => {
    const current = await requireUser();
    const parsed = emailChangeSchema.parse(input);
    const user = await findUserById(current.id);
    if (!user) throw new AppError(userMessage("auth.error.accountNotFound"));

    if (!checkRateLimit("email-change", current.email, 5, 60 * 60_000)) {
      throw new AppError(userMessage("auth.error.emailChangeRateLimited"));
    }

    if (parsed.newEmail === user.email.toLowerCase()) {
      throw new AppError(userMessage("auth.error.emailUnchanged"));
    }
    if (!(await verifyPassword(parsed.currentPassword, user.passwordHash))) {
      throw new AppError(userMessage("auth.error.currentPasswordIncorrect"));
    }

    const existing = await findUserByEmail(parsed.newEmail);
    if (existing && existing.id !== user.id) {
      throw new AppError(userMessage("auth.error.emailTaken"));
    }

    const { token } = await issueAuthToken(
      user.id,
      "email_change",
      EMAIL_CHANGE_TTL_MS,
      { pendingEmail: parsed.newEmail },
    );
    const url = `${publicOrigin()}/change-email/${token}`;
    const expiresInHours = Math.round(EMAIL_CHANGE_TTL_MS / 3_600_000);

    const confirmation = await sendEmail(
      parsed.newEmail,
      emailChangeConfirmationMessage({
        name: user.displayName,
        newEmail: parsed.newEmail,
        url,
        expiresInHours,
      }),
    );

    if (!confirmation.delivered && !confirmation.simulated) {
      throw new AppError(userMessage("auth.error.confirmationEmailFailed"));
    }

    // Best effort: the old address should see that a change was requested.
    try {
      const notice = await sendEmail(
        user.email,
        emailChangeNoticeMessage({
          name: user.displayName,
          newEmail: parsed.newEmail,
          url: `${publicOrigin()}/settings`,
        }),
      );
      if (!notice.delivered && !notice.simulated) {
        log.warn("account.email_change_notice_failed", {
          userId: user.id,
          reason: notice.reason,
        });
      }
    } catch (error) {
      log.error("account.email_change_notice_failed", { userId: user.id, error });
    }

    return {
      emailSent: Boolean(confirmation.delivered),
      emailSimulated: Boolean(confirmation.simulated),
    };
  });
}

export type EmailChangePreview =
  | {
      status: "valid";
      newEmail: string | null;
      signedIn: boolean;
      matchesUser: boolean;
    }
  | { status: "expired" | "used" | "invalid"; signedIn: boolean };

export async function getEmailChangePreview(token: string): Promise<EmailChangePreview> {
  const current = await getOptionalUser();
  const signedIn = Boolean(current);
  const state = await validateAuthToken(token, "email_change");

  if (state.status === "used") return { status: "used", signedIn };
  if (state.status === "expired") return { status: "expired", signedIn };
  if (state.status !== "ok" || !state.pendingEmail) return { status: "invalid", signedIn };

  const matchesUser = Boolean(current && current.id === state.userId);
  return {
    status: "valid",
    newEmail: matchesUser ? state.pendingEmail : null,
    signedIn,
    matchesUser,
  };
}

export async function confirmEmailChange(token: string): Promise<ActionResult<{ email: string }>> {
  return runAction("account.confirmEmailChange", async () => {
    const current = await requireUser();
    const state = await validateAuthToken(token, "email_change");

    if (state.status === "used") throw new AppError(userMessage("auth.error.linkUsed"));
    if (state.status === "expired") {
      throw new AppError(userMessage("auth.error.emailChangeExpired"));
    }
    if (state.status !== "ok" || !state.pendingEmail) {
      throw new AppError(userMessage("auth.error.emailChangeInvalid"));
    }
    if (state.userId !== current.id) {
      throw new AppError(userMessage("auth.error.emailChangeWrongAccount"));
    }

    const pendingEmail = state.pendingEmail;
    const existing = await findUserByEmail(pendingEmail);
    if (existing && existing.id !== current.id) {
      throw new AppError(userMessage("auth.error.emailUnavailable"));
    }

    const claimed = await markTokenUsed(state.tokenId);
    if (!claimed) throw new AppError(userMessage("auth.error.linkUsed"));

    await db
      .update(users)
      .set({
        email: pendingEmail,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, current.id));

    return { email: pendingEmail };
  });
}

export async function cancelEmailChange(): Promise<ActionResult<undefined>> {
  return runAction("account.cancelEmailChange", async () => {
    const current = await requireUser();
    await db
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.userId, current.id),
          eq(authTokens.kind, "email_change"),
          isNull(authTokens.usedAt),
        ),
      );
    return undefined;
  });
}

export async function deleteAccount(input: {
  password: string;
  confirmation: string;
}): Promise<ActionResult<undefined>> {
  return runAction("account.deleteAccount", async () => {
    const current = await requireUser();
    const parsed = deleteAccountSchema.parse(input);
    const user = await findUserById(current.id);
    if (!user) throw new AppError(userMessage("auth.error.accountNotFound"));

    if (!checkRateLimit("delete-account", user.email, 5, 60 * 60_000)) {
      throw new AppError(userMessage("auth.error.rateLimited"));
    }
    if (!(await verifyPassword(parsed.password, user.passwordHash))) {
      throw new AppError(userMessage("auth.error.passwordIncorrect"));
    }
    if (parsed.confirmation.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError(userMessage("auth.error.confirmEmailExact"));
    }

    const memberships = await db
      .select({ treeId: treeMembers.treeId, role: treeMembers.role })
      .from(treeMembers)
      .where(eq(treeMembers.userId, user.id));

    const treeIds = memberships.map(row => row.treeId);
    const treesToDelete: string[] = [];

    if (treeIds.length) {
      const allMembers = await db
        .select({
          treeId: treeMembers.treeId,
          userId: treeMembers.userId,
          role: treeMembers.role,
        })
        .from(treeMembers)
        .where(inArray(treeMembers.treeId, treeIds));

      const membersByTree = new Map<string, { userId: string; role: string }[]>();
      for (const member of allMembers) {
        const list = membersByTree.get(member.treeId) ?? [];
        list.push({ userId: member.userId, role: member.role });
        membersByTree.set(member.treeId, list);
      }

      for (const membership of memberships) {
        const members = membersByTree.get(membership.treeId) ?? [];
        const owners = members.filter(member => member.role === "owner");
        if (
          membership.role === "owner" &&
          owners.length <= 1 &&
          members.length > 1
        ) {
          const [tree] = await db
            .select({ name: trees.name })
            .from(trees)
            .where(eq(trees.id, membership.treeId))
            .limit(1);
          throw new AppError(
            userMessage("settings.error.onlyOwnerDeleteAccount", {
              name: tree?.name ?? userMessage("tree.settings.thisTree"),
            }),
          );
        }
        if (members.length === 1) treesToDelete.push(membership.treeId);
      }

      for (const treeId of treesToDelete) {
        try {
          await deletePrefix(`${TREE_PREFIX}/${treeId}/`);
        } catch (error) {
          log.error("account.tree_storage_delete_failed", { treeId, error });
        }
      }
    }

    await db.transaction(async tx => {
      await tx
        .update(treeActivity)
        .set({ actorUserId: null, actorName: "Former member" })
        .where(eq(treeActivity.actorUserId, user.id));
      if (treesToDelete.length) {
        await tx.delete(trees).where(inArray(trees.id, treesToDelete));
      }
      await tx.delete(users).where(eq(users.id, user.id));
    });

    await endSession();
    return undefined;
  });
}
