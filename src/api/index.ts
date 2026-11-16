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
  getTreeInvites as getTreeInvitesFn,
  getTreeMembers as getTreeMembersFn,
  getTreeOverview as getTreeOverviewFn,
} from "./trees-server";
import { getTreeGraph as getTreeGraphFn } from "./people-server";
import { getCalendarFeed as getCalendarFeedFn } from "./calendar-server";

export const getUser = query(getUserFn, "user");
export const requireUserPage = query(requireUserPageFn, "require-user");
export const getMyTrees = query(getMyTreesFn, "my-trees");
export const getTreeOverview = query(getTreeOverviewFn, "tree-overview");
export const getTreeMembers = query(getTreeMembersFn, "tree-members");
export const getTreeInvites = query(getTreeInvitesFn, "tree-invites");
export const getInvitePreview = query(getInvitePreviewFn, "invite-preview");
export const getTreeGraph = query(getTreeGraphFn, "tree-graph");
export const getCalendarFeed = query(getCalendarFeedFn, "calendar-feed");
export const verifyEmail = query(verifyEmailFn, "verify-email");
export const getPasswordResetPreview = query(getPasswordResetPreviewFn, "password-reset-preview");

export const login = action(loginFn, "login");
export const register = action(registerFn, "register");
export const logout = action(logoutFn, "logout");
export const requestPasswordReset = action(requestPasswordResetFn, "request-password-reset");
export const resetPassword = action(resetPasswordFn, "reset-password");
