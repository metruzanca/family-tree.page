import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../drizzle/schema";
import { env } from "./config";

const globalForDb = globalThis as unknown as { rootsPool?: Pool };

export const pool =
  globalForDb.rootsPool ??
  new Pool({
    connectionString: env("DATABASE_URL"),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.rootsPool = pool;
}

pool.on("error", error => {
  console.error("Unexpected Postgres pool error", error);
});

export const db = drizzle(pool, { schema });
export { schema };
