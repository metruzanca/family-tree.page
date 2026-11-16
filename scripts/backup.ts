import "./env";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  DB_DUMP_PREFIX,
  MEDIA_BACKUP_PREFIX,
  MEDIA_SOURCE_PREFIX,
  dumpKeyFor,
  dumpsToDelete,
  mediaBackupKey,
  staleMediaKeys,
} from "../src/lib/backup";
import { formatBytes } from "../src/lib/format";
import {
  bucketConfig,
  deleteObjects,
  listObjects,
  putJson,
  required,
  sha256File,
} from "./backup-common";

const execFileAsync = promisify(execFile);

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const skipMedia = args.has("--skip-media") || process.env.BACKUP_MEDIA === "off";
  const keepDeletedMedia = args.has("--keep-deleted-media");

  const databaseUrl = required("DATABASE_URL");
  const backup = bucketConfig("BACKUP_S3");
  const startedAt = new Date();

  console.info(
    `Backup started at ${startedAt.toISOString()}${dryRun ? " (dry run)" : ""}.`,
  );

  const directory = await mkdtemp(join(tmpdir(), "family-tree-backup-"));
  const dumpPath = join(directory, "family-tree.dump");

  let failures = 0;

  try {
    console.info("Dumping PostgreSQL...");
    await execFileAsync(
      "pg_dump",
      [
        "--format=custom",
        "--compress=9",
        "--no-owner",
        "--no-privileges",
        "--lock-wait-timeout=30000",
        "--file",
        dumpPath,
        "--dbname",
        databaseUrl,
      ],
      { maxBuffer: 1024 * 1024 },
    );

    const [fileStat, sha256] = await Promise.all([
      stat(dumpPath),
      sha256File(dumpPath),
    ]);
    const dumpKey = dumpKeyFor(startedAt);

    if (dryRun) {
      console.info(`Would upload ${dumpKey} (${formatBytes(fileStat.size)}).`);
    } else {
      await backup.client.send(
        new PutObjectCommand({
          Bucket: backup.bucket,
          Key: dumpKey,
          Body: createReadStream(dumpPath),
          ContentLength: fileStat.size,
          ContentType: "application/octet-stream",
        }),
      );
      console.info(`Uploaded ${dumpKey} (${formatBytes(fileStat.size)}).`);
    }

    const manifest = {
      key: dumpKey,
      createdAt: startedAt.toISOString(),
      sizeBytes: fileStat.size,
      sha256,
      gitSha: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || null,
      media: skipMedia ? "skipped" : "pending",
      mediaCopied: 0,
      mediaDeleted: 0,
    };

    if (!dryRun) await putJson(backup, `${DB_DUMP_PREFIX}latest.json`, manifest);

    if (!skipMedia) {
      console.info("Syncing media...");
      const source = bucketConfig("S3");
      const sourceObjects = await listObjects(source, MEDIA_SOURCE_PREFIX);
      const sourceKeys = sourceObjects.map(object => object.key);
      const backupObjects = await listObjects(backup, MEDIA_BACKUP_PREFIX);
      const backupKeys = backupObjects.map(object => object.key);
      const existing = new Set(backupKeys);

      let copied = 0;
      let copiedBytes = 0;

      for (const key of sourceKeys) {
        const destination = mediaBackupKey(key);
        if (existing.has(destination)) continue;
        if (dryRun) {
          console.info(`Would copy ${key}.`);
          copied += 1;
          continue;
        }
        try {
          const object = await source.client.send(
            new GetObjectCommand({ Bucket: source.bucket, Key: key }),
          );
          await backup.client.send(
            new PutObjectCommand({
              Bucket: backup.bucket,
              Key: destination,
              Body: object.Body,
              ContentType: object.ContentType,
              ContentLength: object.ContentLength,
            }),
          );
          copied += 1;
          copiedBytes += object.ContentLength ?? 0;
        } catch (error) {
          failures += 1;
          console.error(`Could not copy ${key}:`, error);
        }
      }

      let deleted = 0;
      if (keepDeletedMedia) {
        console.info("Keeping media that was deleted from the source bucket.");
      } else if (!sourceKeys.length) {
        console.warn("Source bucket has no media. Skipping deletion to avoid wiping the backup.");
      } else {
        const stale = staleMediaKeys(sourceKeys, backupKeys);
        if (stale.length) {
          if (dryRun) {
            console.info(`Would delete ${stale.length} media objects that no longer exist.`);
          } else {
            await deleteObjects(backup, stale);
            console.info(`Deleted ${stale.length} media objects that no longer exist.`);
          }
          deleted = stale.length;
        }
      }

      console.info(
        `Media: ${copied} copied (${formatBytes(copiedBytes)}), ${deleted} deleted, ${sourceKeys.length} in source.`,
      );

      manifest.media = failures ? "incomplete" : dryRun ? "dry_run" : "complete";
      manifest.mediaCopied = copied;
      manifest.mediaDeleted = deleted;
      if (!dryRun) await putJson(backup, `${DB_DUMP_PREFIX}latest.json`, manifest);
    }

    console.info("Pruning old dumps...");
    const dumpObjects = await listObjects(backup, DB_DUMP_PREFIX);
    const dumpKeys = dumpObjects
      .map(object => object.key)
      .filter(key => key.endsWith(".dump"));
    const expired = dumpsToDelete(dumpKeys, new Date()).filter(key => key !== dumpKey);
    if (expired.length) {
      if (dryRun) {
        console.info(`Would delete ${expired.length} expired dumps.`);
      } else {
        await deleteObjects(backup, expired);
        console.info(`Deleted ${expired.length} expired dumps.`);
      }
    } else {
      console.info("No expired dumps to delete.");
    }

    if (failures) throw new Error(`${failures} media objects could not be backed up.`);
    console.info("Backup finished.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error("Backup failed:", error);
  process.exitCode = 1;
}
