import "./env";
import { pool } from "../src/server/db";
import {
  formatAbuseReport,
  formatBytesShort,
  getAbuseReport,
} from "../src/server/abuse-report";

const accounts = await getAbuseReport();

console.log("Flagged in the last 24 hours");
console.log("============================");
console.log(formatAbuseReport(accounts));

console.log("\nTop uploaders, last 7 days");
console.log("=========================");
const top = [...accounts]
  .filter(account => account.week.bytes > 0)
  .sort((a, b) => b.week.bytes - a.week.bytes)
  .slice(0, 20);
if (!top.length) {
  console.log("No uploads in the last 7 days.");
} else {
  for (const account of top) {
    console.log(
      `${account.email.padEnd(38)} ${formatBytesShort(account.week.bytes).padStart(9)}  ` +
        `${account.week.files} files  ${account.warnings.length} warnings`,
    );
  }
}

await pool.end();
