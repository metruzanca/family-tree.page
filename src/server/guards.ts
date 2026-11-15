import { redirect } from "@solidjs/router";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { trees, treeMembers, type Tree } from "../../drizzle/schema";
import { requireUser, type PublicUser } from "./auth-service";
import { isUuid } from "./ids";

export { isUuid };

export type TreeRole = "owner" | "editor" | "viewer";

const roleRank: Record<TreeRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export type TreeAccess = {
  user: PublicUser;
  tree: Tree;
  role: TreeRole;
};

export async function requireTreeMember(
  treeId: string,
  minRole: TreeRole = "viewer",
): Promise<TreeAccess> {
  if (!isUuid(treeId)) throw redirect("/trees");
  const user = await requireUser();
  const rows = await db
    .select({ role: treeMembers.role, tree: trees })
    .from(treeMembers)
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.userId, user.id)))
    .limit(1);

  const membership = rows[0];
  if (!membership) throw redirect("/trees");
  if (roleRank[membership.role] < roleRank[minRole]) {
    throw new Error("You do not have permission to do that.");
  }

  return { user, tree: membership.tree, role: membership.role };
}

export function canEdit(role: TreeRole) {
  return roleRank[role] >= roleRank.editor;
}

export function canManage(role: TreeRole) {
  return roleRank[role] >= roleRank.owner;
}

export function roleRankOf(role: TreeRole) {
  return roleRank[role];
}
