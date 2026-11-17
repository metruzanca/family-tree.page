"use server";

import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "../server/db";
import { treeActivity } from "../../drizzle/schema";
import { requireTreeMember } from "../server/guards";
import {
  ACTIVITY_GROUP_ACTIONS,
  type ActivityAction,
  type ActivityEntityType,
  type ActivityGroup,
  type ActivityItem,
} from "../lib/activity";

export type TreeActivityFilters = {
  personId?: string | null;
  actorUserId?: string | null;
  group?: ActivityGroup | "";
  before?: string | null;
  limit?: number;
};

export type TreeActivityPage = {
  items: ActivityItem[];
  nextCursor: string | null;
};

export async function getTreeActivity(
  treeId: string,
  filters: TreeActivityFilters = {},
): Promise<TreeActivityPage> {
  await requireTreeMember(treeId);

  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 30), 1), 100);
  const conditions = [eq(treeActivity.treeId, treeId)];

  if (filters.personId) {
    conditions.push(eq(treeActivity.personId, filters.personId));
  }
  if (filters.actorUserId) {
    conditions.push(eq(treeActivity.actorUserId, filters.actorUserId));
  }
  if (filters.group) {
    const actions = ACTIVITY_GROUP_ACTIONS[filters.group];
    conditions.push(inArray(treeActivity.action, actions));
  }
  if (filters.before) {
    const before = new Date(filters.before);
    if (!Number.isNaN(before.getTime())) {
      conditions.push(lt(treeActivity.createdAt, before));
    }
  }

  const rows = await db
    .select()
    .from(treeActivity)
    .where(and(...conditions))
    .orderBy(desc(treeActivity.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(row => ({
    id: row.id,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    action: row.action as ActivityAction,
    entityType: row.entityType as ActivityEntityType,
    entityId: row.entityId,
    personId: row.personId,
    summary: row.summary,
    changes: row.changes,
    createdAt: row.createdAt,
  }));

  return {
    items,
    nextCursor: hasMore
      ? (items[items.length - 1]?.createdAt.toISOString() ?? null)
      : null,
  };
}
