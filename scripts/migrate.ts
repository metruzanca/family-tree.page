import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Database migrations applied.");
} finally {
  await pool.end();
}
