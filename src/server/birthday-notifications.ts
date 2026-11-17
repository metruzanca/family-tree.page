import { log } from "./logger";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "./db";
import {
  birthdayEmailLog,
  people,
  treeMembers,
  trees,
  users,
} from "../../drizzle/schema";
import { publicOrigin } from "./config";
import { sendEmail } from "./email";
import { birthdayMessage } from "./email-templates";
import {
  birthdayMatchesOn,
  birthdayTargetDay,
  formatMonthDay,
  type BirthdayOffset,
  type DateParts,
} from "../lib/calendar";
import { fuzzyYear, type FuzzyDate } from "../lib/fuzzy-date";

export type BirthdayRunSummary = {
  usersNotified: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsFailed: number;
};

type Candidate = {
  userId: string;
  email: string;
  displayName: string;
  enabled: Record<BirthdayOffset, boolean>;
  people: {
    displayName: string;
    birthDate: FuzzyDate;
    treeName: string;
  }[];
};

const KINDS: BirthdayOffset[] = ["week_before", "day_before", "day_of"];

function todayInUtc(now: Date): DateParts {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
  };
}

function dateKey(parts: DateParts) {
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Sends the daily birthday digests. The caller decides when to run this;
 * duplicate runs on the same day are safe because each user, kind, and day
 * is claimed in birthday_email_log before the email is sent.
 */
export async function sendBirthdayNotifications(
  options: { now?: Date } = {},
): Promise<BirthdayRunSummary> {
  const today = todayInUtc(options.now ?? new Date());
  const summary: BirthdayRunSummary = {
    usersNotified: 0,
    emailsSent: 0,
    emailsSkipped: 0,
    emailsFailed: 0,
  };

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      weekBefore: users.notifyBirthdayWeekBefore,
      dayBefore: users.notifyBirthdayDayBefore,
      dayOf: users.notifyBirthdayDayOf,
      firstName: people.firstName,
      lastName: people.lastName,
      nickname: people.nickname,
      birthDate: people.birthDate,
      treeName: trees.name,
    })
    .from(users)
    .innerJoin(treeMembers, eq(treeMembers.userId, users.id))
    .innerJoin(trees, eq(trees.id, treeMembers.treeId))
    .innerJoin(people, eq(people.treeId, trees.id))
    .where(
      and(
        isNotNull(users.emailVerifiedAt),
        isNotNull(people.birthDate),
        isNull(people.deathDate),
        or(
          eq(users.notifyBirthdayWeekBefore, true),
          eq(users.notifyBirthdayDayBefore, true),
          eq(users.notifyBirthdayDayOf, true),
        ),
      ),
    );

  const candidates = new Map<string, Candidate>();
  for (const row of rows) {
    if (!row.birthDate) continue;
    let candidate = candidates.get(row.userId);
    if (!candidate) {
      candidate = {
        userId: row.userId,
        email: row.email,
        displayName: row.displayName,
        enabled: {
          week_before: row.weekBefore,
          day_before: row.dayBefore,
          day_of: row.dayOf,
        },
        people: [],
      };
      candidates.set(row.userId, candidate);
    }
    candidate.people.push({
      displayName:
        `${row.firstName} ${row.lastName}`.trim() || row.nickname || "Unnamed person",
      birthDate: row.birthDate,
      treeName: row.treeName,
    });
  }

  for (const candidate of candidates.values()) {
    let notifiedForUser = false;

    for (const kind of KINDS) {
      if (!candidate.enabled[kind]) continue;
      const target = birthdayTargetDay(today, kind);
      const matches = candidate.people
        .filter(person => birthdayMatchesOn(person.birthDate, target))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!matches.length) continue;

      const claimed = await db
        .insert(birthdayEmailLog)
        .values({
          userId: candidate.userId,
          kind,
          sentOn: dateKey(today),
        })
        .onConflictDoNothing()
        .returning({ id: birthdayEmailLog.id });
      if (!claimed.length) {
        summary.emailsSkipped += 1;
        continue;
      }

      try {
        const result = await sendEmail(
          candidate.email,
          birthdayMessage({
            name: candidate.displayName,
            kind,
            entries: matches.map(person => {
              const birthYear = fuzzyYear(person.birthDate);
              return {
                personName: person.displayName,
                treeName: person.treeName,
                date: formatMonthDay(target),
                age: birthYear === null ? null : target.year - birthYear,
              };
            }),
            url: `${publicOrigin()}/trees`,
          }),
        );

        if (result.delivered || result.simulated) {
          summary.emailsSent += 1;
          notifiedForUser = true;
          continue;
        }

        summary.emailsFailed += 1;
        if (result.reason === "failed") {
          await releaseClaim(candidate.userId, kind, dateKey(today));
        }
      } catch (error) {
        summary.emailsFailed += 1;
        await releaseClaim(candidate.userId, kind, dateKey(today));
        log.error("birthday.email_failed", { userId: candidate.userId, kind, error });
      }
    }

    if (notifiedForUser) summary.usersNotified += 1;
  }

  return summary;
}

async function releaseClaim(userId: string, kind: BirthdayOffset, sentOn: string) {
  await db
    .delete(birthdayEmailLog)
    .where(
      and(
        eq(birthdayEmailLog.userId, userId),
        eq(birthdayEmailLog.kind, kind),
        eq(birthdayEmailLog.sentOn, sentOn),
      ),
    );
}
