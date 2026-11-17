"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { calendarFeeds, users, type CalendarFeed } from "../../drizzle/schema";
import { requireUser } from "../server/auth-service";
import { publicOrigin } from "../server/config";
import { runAction, type ActionResult } from "../server/errors";
import { calendarFeedToken } from "../server/calendar-token";

export type CalendarFeedView = {
  url: string;
  webcalUrl: string;
  createdAt: Date;
};

function feedView(feed: Pick<CalendarFeed, "id" | "createdAt">): CalendarFeedView {
  const url = `${publicOrigin()}/api/calendar/${calendarFeedToken(feed.id)}/birthdays.ics`;
  return {
    url,
    webcalUrl: url.replace(/^https?:\/\//, "webcal://"),
    createdAt: feed.createdAt,
  };
}

export async function getCalendarFeed(): Promise<CalendarFeedView | null> {
  const user = await requireUser();
  const rows = await db
    .select({ id: calendarFeeds.id, createdAt: calendarFeeds.createdAt })
    .from(calendarFeeds)
    .where(and(eq(calendarFeeds.userId, user.id), isNull(calendarFeeds.revokedAt)))
    .limit(1);
  const feed = rows[0];
  return feed ? feedView(feed) : null;
}

export async function createCalendarFeed(): Promise<ActionResult<CalendarFeedView>> {
  return runAction("calendar.createCalendarFeed", async () => {
    const user = await requireUser();
    const feed = await db.transaction(async tx => {
      // Serialize concurrent creates for the same user before replacing the
      // active feed, so the partial unique index never rejects a request.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update");

      await tx
        .update(calendarFeeds)
        .set({ revokedAt: new Date() })
        .where(and(eq(calendarFeeds.userId, user.id), isNull(calendarFeeds.revokedAt)));

      const [created] = await tx
        .insert(calendarFeeds)
        .values({ userId: user.id })
        .returning();
      return created;
    });

    return feedView(feed);
  });
}

export async function disableCalendarFeed(): Promise<ActionResult<undefined>> {
  return runAction("calendar.disableCalendarFeed", async () => {
    const user = await requireUser();
    await db
      .update(calendarFeeds)
      .set({ revokedAt: new Date() })
      .where(and(eq(calendarFeeds.userId, user.id), isNull(calendarFeeds.revokedAt)));
    return undefined;
  });
}
