import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import { calendarFeeds, people, treeMembers, trees, users } from "../../drizzle/schema";
import { parseCalendarFeedToken } from "./calendar-token";
import type { BirthdayPerson } from "../lib/birthday-ical";

export type CalendarFeedData = {
  userName: string;
  people: BirthdayPerson[];
};

/**
 * Resolves a token to the user's current birthday data. Membership is checked
 * on every request, so leaving a tree immediately removes its people.
 */
export async function resolveCalendarFeed(token: string): Promise<CalendarFeedData | null> {
  const feedId = parseCalendarFeedToken(token);
  if (!feedId) return null;

  const feedRows = await db
    .select({
      userId: calendarFeeds.userId,
      displayName: users.displayName,
    })
    .from(calendarFeeds)
    .innerJoin(users, eq(users.id, calendarFeeds.userId))
    .where(and(eq(calendarFeeds.id, feedId), isNull(calendarFeeds.revokedAt)))
    .limit(1);
  const feed = feedRows[0];
  if (!feed) return null;

  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      nickname: people.nickname,
      birthDate: people.birthDate,
      deathDate: people.deathDate,
      treeId: people.treeId,
      treeName: trees.name,
    })
    .from(treeMembers)
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .innerJoin(people, eq(people.treeId, trees.id))
    .where(
      and(
        eq(treeMembers.userId, feed.userId),
        isNotNull(people.birthDate),
        isNull(trees.deletedAt),
      ),
    )
    .orderBy(asc(people.lastName), asc(people.firstName));

  return {
    userName: feed.displayName,
    people: rows.flatMap(row =>
      row.birthDate ? [{ ...row, birthDate: row.birthDate }] : [],
    ),
  };
}
