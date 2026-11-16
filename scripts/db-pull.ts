import "./env";
import { spawn, spawnSync } from "node:child_process";

const localUrl = process.env.DATABASE_URL;
if (!localUrl) {
  console.error("DATABASE_URL is required in .env.");
  process.exit(1);
}

let localHost: string;
try {
  localHost = new URL(localUrl).hostname;
} catch {
  console.error("DATABASE_URL is not a valid connection string.");
  process.exit(1);
}
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(localHost)) {
  console.error(`Refusing to restore into a remote database: ${localHost}`);
  process.exit(1);
}

const databaseService = process.env.RAILWAY_DB_SERVICE ?? "Postgres";
const dumpCommand =
  'pg_dump --no-owner --no-privileges --clean --if-exists --format=plain "$DATABASE_URL"';

function commandExists(command: string) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

if (!commandExists("railway")) {
  console.error("Missing 'railway'. Install the Railway CLI first.");
  process.exit(1);
}
if (!commandExists("psql")) {
  console.error("Missing 'psql'. Enter the dev shell first: nix-shell");
  process.exit(1);
}

const version = spawnSync("psql", [localUrl, "-tAc", "show server_version_num"], {
  encoding: "utf8",
});
if (version.status !== 0) {
  console.error("Could not connect to the local database. Run `pnpm dev:services` first.");
  process.exit(1);
}
const versionNumber = Number(version.stdout.trim());
if (!Number.isFinite(versionNumber) || versionNumber < 180000) {
  console.error(
    [
      `Local Postgres is ${version.stdout.trim()}, but production is 18.`,
      "Reset the local cluster, then try again:",
      "  pnpm dev:reset-db",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`Dumping ${databaseService} through Railway SSH...`);

const dump = spawn("railway", ["ssh", "--service", databaseService, "--", dumpCommand], {
  stdio: ["ignore", "pipe", "pipe"],
});
const restore = spawn(
  "psql",
  [localUrl, "-v", "ON_ERROR_STOP=1", "--single-transaction", "--quiet"],
  { stdio: ["pipe", "ignore", "pipe"] },
);

let dumpError = "";
let restoreError = "";
dump.stderr.on("data", chunk => {
  dumpError += String(chunk);
});
restore.stderr.on("data", chunk => {
  restoreError += String(chunk);
});

dump.stdout.pipe(restore.stdin);
dump.on("close", code => {
  if (code !== 0) restore.stdin.end();
});

function waitFor(child: ReturnType<typeof spawn>) {
  return new Promise<number | null>(resolve => {
    child.on("close", code => resolve(code));
    child.on("error", () => resolve(1));
  });
}

const [dumpCode, restoreCode] = await Promise.all([waitFor(dump), waitFor(restore)]);

if (dumpCode !== 0) {
  console.error("pg_dump failed.");
  if (dumpError.trim()) console.error(dumpError.trim());
  process.exit(1);
}
if (restoreCode !== 0) {
  console.error("Restoring into the local database failed.");
  if (restoreError.trim()) console.error(restoreError.trim());
  process.exit(1);
}

console.log("Restored production data into the local database.");
console.log("Applying migrations for the current branch...");
const migrate = spawnSync("pnpm", ["db:migrate"], { stdio: "inherit" });
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const counts = spawnSync(
  "psql",
  [
    localUrl,
    "-tAc",
    "select 'trees=' || (select count(*) from trees) || ' people=' || (select count(*) from people) || ' relationships=' || ((select count(*) from parent_child) + (select count(*) from partnerships))",
  ],
  { encoding: "utf8" },
);
if (counts.status === 0) {
  console.log(counts.stdout.trim());
}
