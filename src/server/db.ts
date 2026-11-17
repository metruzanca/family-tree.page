import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../drizzle/schema";
import { env } from "./config";
import { log } from "./logger";

const globalForDb = globalThis as unknown as { familyTreePool?: Pool };

export const pool =
  globalForDb.familyTreePool ??
  new Pool({
    connectionString: env("DATABASE_URL"),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.familyTreePool = pool;
}

pool.on("error", error => {
  log.error("db.pool_error", { error });
});

export const db = drizzle(pool, { schema });
export { schema };
