import type { APIEvent } from "@solidjs/start/server";
import { publicOrigin } from "../../../../server/config";
import { resolveCalendarFeed } from "../../../../server/calendar-feed";
import { buildBirthdayCalendar } from "../../../../lib/birthday-ical";

export async function GET({ params }: APIEvent) {
  const feed = await resolveCalendarFeed(params.token);
  if (!feed) return new Response("Not found", { status: 404 });

  const body = buildBirthdayCalendar({
    userName: feed.userName,
    people: feed.people,
    origin: publicOrigin(),
    now: new Date(),
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="family-tree-birthdays.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
