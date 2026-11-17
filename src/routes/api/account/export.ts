import { log } from "../../../server/logger";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { eq, inArray, isNull, and } from "drizzle-orm";
import type { APIEvent } from "@solidjs/start/server";
import { db } from "../../../server/db";
import {
  calendarFeeds,
  fileFaces,
  fileGroups,
  fileTags,
  files,
  parentChild,
  partnerships,
  people,
  personEvents,
  treeMembers,
  trees,
  users,
} from "../../../../drizzle/schema";
import { checkRateLimit, findUserById, getOptionalUser } from "../../../server/auth-service";
import { calendarFeedToken } from "../../../server/calendar-token";
import { publicOrigin } from "../../../server/config";
import { sanitizeFileName } from "../../../server/file-service";
import { getObjectStream } from "../../../server/storage";

export async function GET(event: APIEvent) {
  const current = await getOptionalUser();
  if (!current) {
    return Response.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  if (!checkRateLimit("account-export", current.email, 3, 60 * 60_000)) {
    return Response.json(
      { ok: false, error: "Too many exports. Try again in an hour." },
      { status: 429 },
    );
  }

  const user = await findUserById(current.id);
  if (!user) {
    return Response.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const includeMedia = new URL(event.request.url).searchParams.get("media") === "1";
  const exportedAt = new Date();

  const memberships = await db
    .select({ treeId: treeMembers.treeId, role: treeMembers.role })
    .from(treeMembers)
    .where(eq(treeMembers.userId, user.id));

  const treeIds = memberships.map(row => row.treeId);
  const treeRows = treeIds.length
    ? await db.select().from(trees).where(inArray(trees.id, treeIds))
    : [];

  const activeFeed = await db
    .select({ id: calendarFeeds.id, createdAt: calendarFeeds.createdAt })
    .from(calendarFeeds)
    .where(and(eq(calendarFeeds.userId, user.id), isNull(calendarFeeds.revokedAt)))
    .limit(1);

  const exportTrees = [];
  const mediaFiles: {
    treeId: string;
    fileId: string;
    storageKey: string;
    thumbKey: string | null;
    name: string;
  }[] = [];

  for (const tree of treeRows) {
    const membership = memberships.find(row => row.treeId === tree.id);
    if (!membership) continue;

    const [
      peopleRows,
      parentRows,
      partnerRows,
      groupRows,
      fileRows,
      tagRows,
      faceRows,
      memberRows,
      eventRows,
    ] = await Promise.all([
      db.select().from(people).where(eq(people.treeId, tree.id)),
      db.select().from(parentChild).where(eq(parentChild.treeId, tree.id)),
      db.select().from(partnerships).where(eq(partnerships.treeId, tree.id)),
      db.select().from(fileGroups).where(eq(fileGroups.treeId, tree.id)),
      db.select().from(files).where(eq(files.treeId, tree.id)),
      db.select().from(fileTags).where(eq(fileTags.treeId, tree.id)),
      db.select().from(fileFaces).where(eq(fileFaces.treeId, tree.id)),
      db
        .select({ displayName: users.displayName, role: treeMembers.role })
        .from(treeMembers)
        .innerJoin(users, eq(users.id, treeMembers.userId))
        .where(eq(treeMembers.treeId, tree.id)),
      db.select().from(personEvents).where(eq(personEvents.treeId, tree.id)),
    ]);

    exportTrees.push({
      tree: {
        id: tree.id,
        name: tree.name,
        description: tree.description,
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt,
      },
      role: membership.role,
      members: memberRows,
      people: peopleRows,
      parentChild: parentRows,
      partnerships: partnerRows,
      fileGroups: groupRows,
      files: fileRows.map(file => ({
        id: file.id,
        personId: file.personId,
        groupId: file.groupId,
        originalName: file.originalName,
        mimeType: file.mimeType,
        kind: file.kind,
        sizeBytes: file.sizeBytes,
        width: file.width,
        height: file.height,
        takenAt: file.takenAt,
        facesScannedAt: file.facesScannedAt,
        status: file.status,
        isAvatar: file.isAvatar,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })),
      fileTags: tagRows,
      fileFaces: faceRows,
      personEvents: eventRows,
    });

    if (includeMedia) {
      for (const file of fileRows) {
        if (file.status !== "ready") continue;
        mediaFiles.push({
          treeId: tree.id,
          fileId: file.id,
          storageKey: file.storageKey,
          thumbKey: file.thumbKey,
          name: sanitizeFileName(file.originalName),
        });
      }
    }
  }

  const manifest = {
    formatVersion: 1,
    exportedAt: exportedAt.toISOString(),
    includesMedia: includeMedia,
    account: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: Boolean(user.emailVerifiedAt),
      birthdayReminders: {
        weekBefore: user.notifyBirthdayWeekBefore,
        dayBefore: user.notifyBirthdayDayBefore,
        dayOf: user.notifyBirthdayDayOf,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    calendarFeed: activeFeed[0]
      ? {
          createdAt: activeFeed[0].createdAt,
          url: `${publicOrigin()}/api/calendar/${calendarFeedToken(activeFeed[0].id)}/birthdays.ics`,
        }
      : null,
    trees: exportTrees,
    note: includeMedia
      ? "Media files are included under each tree's media folder."
      : "Media files are not included. Download again with ?media=1 to include them.",
  };

  if (new URL(event.request.url).searchParams.get("format") === "json") {
    const fileName = `family-tree-export-${exportedAt.toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(manifest, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on("warning", (error: Error) => {
    log.warn("account.export_warning", { error });
  });
  archive.on("error", (error: Error) => {
    log.error("account.export_failed", { error });
  });

  archive.append(JSON.stringify(manifest, null, 2), {
    name: "family-tree-export.json",
  });
  archive.append(
    [
      "family-tree account export",
      "",
      `Exported: ${exportedAt.toISOString()}`,
      `Account: ${user.email}`,
      `Trees: ${exportTrees.length}`,
      `Media included: ${includeMedia ? "yes" : "no"}`,
      "",
      "Open family-tree-export.json for the full data.",
    ].join("\n"),
    { name: "README.txt" },
  );

  if (includeMedia) {
    for (const media of mediaFiles) {
      try {
        const object = await getObjectStream(media.storageKey);
        archive.append(Readable.fromWeb(object.stream as never), {
          name: `trees/${media.treeId}/media/${media.fileId}-${media.name}`,
        });
        if (media.thumbKey) {
          try {
            const thumb = await getObjectStream(media.thumbKey);
            archive.append(Readable.fromWeb(thumb.stream as never), {
              name: `trees/${media.treeId}/media/thumbs/${media.fileId}-${media.name}`,
            });
          } catch (error) {
            log.warn("account.export_thumbnail_failed", { fileId: media.fileId, error });
          }
        }
      } catch (error) {
        log.warn("account.export_media_failed", { fileId: media.fileId, error });
      }
    }
  }

  void archive.finalize();

  const fileName = `family-tree-export-${exportedAt.toISOString().slice(0, 10)}.zip`;
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
