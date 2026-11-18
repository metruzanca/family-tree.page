import { action, query } from "@solidjs/router";
import {
  getPasswordResetPreview as getPasswordResetPreviewFn,
  getUser as getUserFn,
  login as loginFn,
  logout as logoutFn,
  register as registerFn,
  requestPasswordReset as requestPasswordResetFn,
  resetPassword as resetPasswordFn,
  verifyEmail as verifyEmailFn,
} from "./auth-server";
import { requireUserPage as requireUserPageFn } from "./require-user-server";
import {
  getInvitePreview as getInvitePreviewFn,
  getMyTrees as getMyTreesFn,
  getPendingDeletionTrees as getPendingDeletionTreesFn,
  getTreeInvites as getTreeInvitesFn,
  getTreeMembers as getTreeMembersFn,
  getTreeOverview as getTreeOverviewFn,
} from "./trees-server";
import { getTreeGraph as getTreeGraphFn } from "./people-server";
import {
  createTreeApiToken as createTreeApiTokenFn,
  getTreeApiTokens as getTreeApiTokensFn,
  revokeTreeApiToken as revokeTreeApiTokenFn,
} from "./api-tokens-server";
import { getTreeActivity as getTreeActivityFn } from "./activity-server";
import {
  getSharedTree as getSharedTreeFn,
  getTreeShareLinks as getTreeShareLinksFn,
} from "./share-server";
import { getCalendarFeed as getCalendarFeedFn } from "./calendar-server";
import {
  getEmailChangePreview as getEmailChangePreviewFn,
  getPendingEmailChange as getPendingEmailChangeFn,
  getUsage as getUsageFn,
} from "./account-server";

export const getUser = query(getUserFn, "user");
export const requireUserPage = query(requireUserPageFn, "require-user");
export const getMyTrees = query(getMyTreesFn, "my-trees");
export const getPendingDeletionTrees = query(
  getPendingDeletionTreesFn,
  "pending-deletion-trees",
);
export const getTreeOverview = query(getTreeOverviewFn, "tree-overview");
export const getTreeMembers = query(getTreeMembersFn, "tree-members");
export const getTreeInvites = query(getTreeInvitesFn, "tree-invites");
export const getInvitePreview = query(getInvitePreviewFn, "invite-preview");
export const getTreeGraph = query(getTreeGraphFn, "tree-graph");
export const getTreeActivity = query(getTreeActivityFn, "tree-activity");
export const getSharedTree = query(getSharedTreeFn, "shared-tree");
export const getTreeShareLinks = query(getTreeShareLinksFn, "tree-share-links");
export const getTreeApiTokens = query(getTreeApiTokensFn, "tree-api-tokens");
export const getCalendarFeed = query(getCalendarFeedFn, "calendar-feed");
export const verifyEmail = query(verifyEmailFn, "verify-email");
export const getPasswordResetPreview = query(getPasswordResetPreviewFn, "password-reset-preview");
export const getPendingEmailChange = query(getPendingEmailChangeFn, "pending-email-change");
export const getEmailChangePreview = query(getEmailChangePreviewFn, "email-change-preview");
export const getUsage = query(getUsageFn, "account-usage");

export const createTreeApiToken = action(createTreeApiTokenFn, "create-tree-api-token");
export const revokeTreeApiToken = action(revokeTreeApiTokenFn, "revoke-tree-api-token");

export const login = action(loginFn, "login");
export const register = action(registerFn, "register");
export const logout = action(logoutFn, "logout");
export const requestPasswordReset = action(requestPasswordResetFn, "request-password-reset");
export const resetPassword = action(resetPasswordFn, "reset-password");
