"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  people,
  treeInvites,
  treeMembers,
  trees,
  users,
  type Tree,
} from "../../drizzle/schema";
import { requireUser } from "../server/auth-service";
import {
  canManage,
  requireTreeMember,
  type TreeRole,
} from "../server/guards";
import { AppError, runAction, type ActionResult } from "../server/errors";
import { inviteSchema, treeRoleSchema, treeSchema } from "../server/validation";
import { deletePrefix, TREE_PREFIX } from "../server/storage";
import { publicOrigin } from "../server/config";

export type TreeSummary = {
  id: string;
  name: string;
  description: string | null;
  role: TreeRole;
  peopleCount: number;
  memberCount: number;
  updatedAt: Date;
};

export async function getMyTrees(): Promise<TreeSummary[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      id: trees.id,
      name: trees.name,
      description: trees.description,
      role: treeMembers.role,
      updatedAt: trees.updatedAt,
      peopleCount: sql<number>`(select count(*) from ${people} where ${people.treeId} = ${trees.id})`,
      memberCount: sql<number>`(select count(*) from ${treeMembers} where ${treeMembers.treeId} = ${trees.id})`,
    })
    .from(treeMembers)
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .where(eq(treeMembers.userId, user.id))
    .orderBy(desc(trees.updatedAt));

  return rows.map(row => ({
    ...row,
    peopleCount: Number(row.peopleCount),
    memberCount: Number(row.memberCount),
  }));
}

export type TreeOverview = {
  tree: Tree;
  role: TreeRole;
  peopleCount: number;
  memberCount: number;
};

export async function getTreeOverview(treeId: string): Promise<TreeOverview> {
  const access = await requireTreeMember(treeId);
  const [peopleRow] = await db
    .select({ value: count() })
    .from(people)
    .where(eq(people.treeId, treeId));
  const [membersRow] = await db
    .select({ value: count() })
    .from(treeMembers)
    .where(eq(treeMembers.treeId, treeId));

  return {
    tree: access.tree,
    role: access.role,
    peopleCount: Number(peopleRow?.value ?? 0),
    memberCount: Number(membersRow?.value ?? 0),
  };
}

export async function createTree(input: {
  name: string;
  description?: string | null;
}): Promise<ActionResult<{ id: string; role: TreeRole }>> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = treeSchema.parse(input);
    const result = await db.transaction(async tx => {
      const [tree] = await tx.insert(trees).values({
        name: parsed.name,
        description: parsed.description,
        createdBy: user.id,
      }).returning();
      await tx.insert(treeMembers).values({
        treeId: tree.id,
        userId: user.id,
        role: "owner",
      });
      return tree;
    });
    return { id: result.id, role: "owner" as TreeRole };
  });
}

export async function updateTree(input: {
  treeId: string;
  name: string;
  description?: string | null;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    if (!canManage(access.role)) throw new AppError("Only owners can change tree settings.");
    const parsed = treeSchema.parse(input);
    await db
      .update(trees)
      .set({ name: parsed.name, description: parsed.description, updatedAt: new Date() })
      .where(eq(trees.id, input.treeId));
    return undefined;
  });
}

export async function deleteTree(treeId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(treeId, "owner");
    if (!canManage(access.role)) throw new AppError("Only owners can delete a tree.");
    try {
      await deletePrefix(`${TREE_PREFIX}/${treeId}/`);
    } catch (error) {
      console.error("Could not remove all tree objects from storage", error);
    }
    await db.delete(trees).where(eq(trees.id, treeId));
    return undefined;
  });
}

export type TreeMemberView = {
  userId: string;
  email: string;
  displayName: string;
  role: TreeRole;
  joinedAt: Date;
};

export async function getTreeMembers(treeId: string): Promise<TreeMemberView[]> {
  await requireTreeMember(treeId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: treeMembers.role,
      joinedAt: treeMembers.createdAt,
    })
    .from(treeMembers)
    .innerJoin(users, eq(users.id, treeMembers.userId))
    .where(eq(treeMembers.treeId, treeId))
    .orderBy(asc(treeMembers.createdAt));
  return rows;
}

export async function updateMemberRole(input: {
  treeId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    await requireTreeMember(input.treeId, "owner");
    const role = treeRoleSchema.parse(input.role);
    await db.transaction(async tx => {
      const owners = await tx
        .select({ userId: treeMembers.userId })
        .from(treeMembers)
        .where(and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.role, "owner")));
      if (role !== "owner" && owners.some(owner => owner.userId === input.userId) && owners.length <= 1) {
        throw new AppError("A tree needs at least one owner.");
      }
      const updated = await tx
        .update(treeMembers)
        .set({ role })
        .where(
          and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.userId, input.userId)),
        )
        .returning({ userId: treeMembers.userId });
      if (!updated.length) throw new AppError("That person is not a member of this tree.");
    });
    return undefined;
  });
}

export async function removeMember(input: {
  treeId: string;
  userId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    await requireTreeMember(input.treeId, "owner");
    await db.transaction(async tx => {
      const members = await tx
        .select({ userId: treeMembers.userId, role: treeMembers.role })
        .from(treeMembers)
        .where(eq(treeMembers.treeId, input.treeId));
      const target = members.find(member => member.userId === input.userId);
      if (!target) throw new AppError("That person is not a member of this tree.");
      if (target.role === "owner" && members.filter(member => member.role === "owner").length <= 1) {
        throw new AppError("A tree needs at least one owner.");
      }
      await tx
        .delete(treeMembers)
        .where(
          and(eq(treeMembers.treeId, input.treeId), eq(treeMembers.userId, input.userId)),
        );
    });
    return undefined;
  });
}

export async function leaveTree(treeId: string): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const access = await requireTreeMember(treeId);
    await db.transaction(async tx => {
      if (access.role === "owner") {
        const owners = await tx
          .select({ userId: treeMembers.userId })
          .from(treeMembers)
          .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.role, "owner")));
        if (owners.length <= 1) throw new AppError("Promote another owner before leaving this tree.");
      }
      await tx
        .delete(treeMembers)
        .where(and(eq(treeMembers.treeId, treeId), eq(treeMembers.userId, access.user.id)));
    });
    return undefined;
  });
}

export type InviteView = {
  id: string;
  role: TreeRole;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  acceptedBy: string | null;
};

export async function getTreeInvites(treeId: string): Promise<InviteView[]> {
  await requireTreeMember(treeId, "owner");
  return db
    .select({
      id: treeInvites.id,
      role: treeInvites.role,
      createdAt: treeInvites.createdAt,
      expiresAt: treeInvites.expiresAt,
      revokedAt: treeInvites.revokedAt,
      acceptedAt: treeInvites.acceptedAt,
      acceptedBy: treeInvites.acceptedBy,
    })
    .from(treeInvites)
    .where(eq(treeInvites.treeId, treeId))
    .orderBy(desc(treeInvites.createdAt));
}

export async function createInvite(input: {
  treeId: string;
  role: TreeRole;
  expiresInDays: number;
}): Promise<ActionResult<{ id: string; url: string; expiresAt: Date; role: TreeRole }>> {
  return runAction(async () => {
    const access = await requireTreeMember(input.treeId, "owner");
    const parsed = inviteSchema.parse(input);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + parsed.expiresInDays * 24 * 60 * 60_000);
    const [invite] = await db
      .insert(treeInvites)
      .values({
        treeId: access.tree.id,
        tokenHash,
        role: parsed.role,
        createdBy: access.user.id,
        expiresAt,
      })
      .returning();
    return {
      id: invite.id,
      url: `${publicOrigin()}/invite/${token}`,
      expiresAt: invite.expiresAt,
      role: invite.role,
    };
  });
}

export async function revokeInvite(input: {
  treeId: string;
  inviteId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    await requireTreeMember(input.treeId, "owner");
    const updated = await db
      .update(treeInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(treeInvites.id, input.inviteId),
          eq(treeInvites.treeId, input.treeId),
          isNull(treeInvites.revokedAt),
          isNull(treeInvites.acceptedAt),
        ),
      )
      .returning({ id: treeInvites.id });
    if (!updated.length) throw new AppError("That invite is no longer active.");
    return undefined;
  });
}

export type InvitePreview =
  | { status: "valid"; treeName: string; inviterName: string; role: TreeRole; expiresAt: Date }
  | { status: "expired" | "revoked" | "used" | "invalid" };

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  if (!token || token.length > 200) return { status: "invalid" };
  const rows = await db
    .select({
      role: treeInvites.role,
      expiresAt: treeInvites.expiresAt,
      revokedAt: treeInvites.revokedAt,
      acceptedAt: treeInvites.acceptedAt,
      treeName: trees.name,
      inviterName: users.displayName,
    })
    .from(treeInvites)
    .innerJoin(trees, eq(trees.id, treeInvites.treeId))
    .leftJoin(users, eq(users.id, treeInvites.createdBy))
    .where(eq(treeInvites.tokenHash, hashInviteToken(token)))
    .limit(1);
  const invite = rows[0];
  if (!invite) return { status: "invalid" };
  if (invite.revokedAt) return { status: "revoked" };
  if (invite.acceptedAt) return { status: "used" };
  if (invite.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  return {
    status: "valid",
    treeName: invite.treeName,
    inviterName: invite.inviterName ?? "Someone",
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(token: string): Promise<ActionResult<{ treeId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (!token || token.length > 200) throw new AppError("That invite link is not valid.");
    const tokenHash = hashInviteToken(token);

    return db.transaction(async tx => {
      const rows = await tx
        .select()
        .from(treeInvites)
        .where(eq(treeInvites.tokenHash, tokenHash))
        .for("update")
        .limit(1);
      const invite = rows[0];
      if (!invite) throw new AppError("That invite link is not valid.");
      if (invite.revokedAt) throw new AppError("That invite has been revoked.");
      if (invite.acceptedAt) throw new AppError("That invite has already been used.");
      if (invite.expiresAt.getTime() <= Date.now()) throw new AppError("That invite has expired.");

      const existing = await tx
        .select({ userId: treeMembers.userId })
        .from(treeMembers)
        .where(
          and(eq(treeMembers.treeId, invite.treeId), eq(treeMembers.userId, user.id)),
        )
        .limit(1);

      if (!existing.length) {
        await tx.insert(treeMembers).values({
          treeId: invite.treeId,
          userId: user.id,
          role: invite.role,
        });
      }

      await tx
        .update(treeInvites)
        .set({ acceptedAt: new Date(), acceptedBy: user.id })
        .where(eq(treeInvites.id, invite.id));

      return { treeId: invite.treeId };
    });
  });
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
