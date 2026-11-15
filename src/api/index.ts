import { action, query } from "@solidjs/router";
import { getUser as getUserFn, login as loginFn, logout as logoutFn, register as registerFn } from "./auth-server";
import { requireUserPage as requireUserPageFn } from "./require-user-server";
import {
  getInvitePreview as getInvitePreviewFn,
  getMyTrees as getMyTreesFn,
  getTreeInvites as getTreeInvitesFn,
  getTreeMembers as getTreeMembersFn,
  getTreeOverview as getTreeOverviewFn,
} from "./trees-server";
import { getTreeGraph as getTreeGraphFn } from "./people-server";

export const getUser = query(getUserFn, "user");
export const requireUserPage = query(requireUserPageFn, "require-user");
export const getMyTrees = query(getMyTreesFn, "my-trees");
export const getTreeOverview = query(getTreeOverviewFn, "tree-overview");
export const getTreeMembers = query(getTreeMembersFn, "tree-members");
export const getTreeInvites = query(getTreeInvitesFn, "tree-invites");
export const getInvitePreview = query(getInvitePreviewFn, "invite-preview");
export const getTreeGraph = query(getTreeGraphFn, "tree-graph");

export const login = action(loginFn, "login");
export const register = action(registerFn, "register");
export const logout = action(logoutFn, "logout");
