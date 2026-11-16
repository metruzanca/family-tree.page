import "./env";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DB_DUMP_PREFIX } from "../src/lib/backup";
import { bucketConfig, downloadToFile, getJson, required } from "./backup-common";

const execFileAsync = promisify(execFile);

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!process.argv.includes("--yes")) {
  console.error(
    [
      "This replaces every table in the target database.",
      "Run it against a local scratch database, then pass --yes:",
      "",
      "  pnpm backup:restore --key postgres/2026-11-16T03-00-00Z.dump --yes",
      "",
      "Omit --key to restore the dump named by postgres/latest.json.",
    ].join("\n"),
  );
  process.exit(1);
}

const databaseUrl = required("DATABASE_URL");
let host: string;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  console.error("DATABASE_URL is not a valid connection string.");
  process.exit(1);
}

if (!localHosts.has(host)) {
  console.error(
    `Refusing to restore into a remote database (${host}). Point DATABASE_URL at a local scratch database.`,
  );
  process.exit(1);
}

const keyIndex = process.argv.indexOf("--key");
const requestedKey = keyIndex >= 0 ? process.argv[keyIndex + 1] : undefined;

const backup = bucketConfig("BACKUP_S3");
const manifest = await getJson<{ key?: string }>(backup, `${DB_DUMP_PREFIX}latest.json`);
const key = requestedKey ?? manifest?.key;

if (!key) {
  console.error(`No dump found. Run "pnpm backup" first, or pass --key <object key>.`);
  process.exit(1);
}

const directory = await mkdtemp(join(tmpdir(), "family-tree-restore-"));
const path = join(directory, "family-tree.dump");

try {
  console.info(`Downloading ${key}...`);
  await downloadToFile(backup, key, path);
  console.info(`Restoring ${key} into ${host}...`);

  await execFileAsync(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      databaseUrl,
      path,
    ],
    { maxBuffer: 20 * 1024 * 1024 },
  );

  console.info("Restore complete. Run pnpm db:check to inspect relationship integrity.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
