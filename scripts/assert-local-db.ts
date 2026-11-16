import "./env";

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (process.env.ALLOW_REMOTE_DB === "1") {
  process.exit(0);
}

const allowDeployed = process.argv.includes("--allow-deployed");
if (allowDeployed && process.env.RAILWAY_ENVIRONMENT) {
  process.exit(0);
}

let host: string;
try {
  host = new URL(databaseUrl).hostname;
} catch {
  console.error("DATABASE_URL is not a valid connection string.");
  process.exit(1);
}

if (!localHosts.has(host)) {
  console.error(
    [
      `Refusing to use a remote database while developing: ${host}`,
      "",
      "Copy production data into the local database instead:",
      "  pnpm db:pull",
      "",
      "If you really need a remote database, set ALLOW_REMOTE_DB=1.",
    ].join("\n"),
  );
  process.exit(1);
}
