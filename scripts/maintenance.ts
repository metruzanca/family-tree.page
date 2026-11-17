import "./env";
import { pool } from "../src/server/db";
import { runMaintenance } from "../src/server/maintenance";

const summary = await runMaintenance();
console.log(summary);
await pool.end();
