import "./env";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DB_DUMP_PREFIX } from "../src/lib/backup";
import { formatBytes } from "../src/lib/format";
import { bucketConfig, downloadToFile, getJson, sha256File } from "./backup-common";

const execFileAsync = promisify(execFile);

type Manifest = {
  key: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  media?: string;
};

const keyIndex = process.argv.indexOf("--key");
const requestedKey = keyIndex >= 0 ? process.argv[keyIndex + 1] : undefined;

const backup = bucketConfig("BACKUP_S3");
const manifest = await getJson<Manifest>(backup, `${DB_DUMP_PREFIX}latest.json`);
const key = requestedKey ?? manifest?.key;

if (!key) {
  console.error(`No dump found. Run "pnpm backup" first, or pass --key <object key>.`);
  process.exit(1);
}

const directory = await mkdtemp(join(tmpdir(), "family-tree-verify-"));
const path = join(directory, "family-tree.dump");

try {
  console.info(`Downloading ${key}...`);
  await downloadToFile(backup, key, path);

  const fileStat = await stat(path);
  const digest = await sha256File(path);

  if (!requestedKey && manifest) {
    if (digest !== manifest.sha256) {
      throw new Error(
        `Checksum mismatch for ${key}: expected ${manifest.sha256}, got ${digest}.`,
      );
    }
    if (fileStat.size !== manifest.sizeBytes) {
      throw new Error(
        `Size mismatch for ${key}: expected ${manifest.sizeBytes}, got ${fileStat.size}.`,
      );
    }
  }

  const { stdout } = await execFileAsync("pg_restore", ["--list", path], {
    maxBuffer: 20 * 1024 * 1024,
  });
  const entries = stdout
    .split("\n")
    .filter(line => line.trim() && !line.trim().startsWith(";")).length;

  console.info(
    `Backup OK: ${key} (${formatBytes(fileStat.size)}, ${entries} archive entries, sha256 ${digest.slice(0, 12)}…).`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
