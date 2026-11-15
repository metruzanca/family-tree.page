import { sql } from "drizzle-orm";
import type { APIEvent } from "@solidjs/start/server";
import { db } from "../../server/db";

export async function GET(_event: APIEvent) {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
