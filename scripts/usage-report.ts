import "./env";
import { pool } from "../src/server/db";
import { formatBytes } from "../src/lib/format";
import { getUsageReport } from "../src/server/abuse-report";

const accounts = await getUsageReport();

if (!accounts.length) {
  console.log("No accounts found.");
} else {
  console.log(
    "email".padEnd(38) + "storage".padStart(12) + "quota".padStart(12) + "people".padStart(16),
  );
  for (const account of accounts) {
    const percent = Math.round((account.storageBytes / Math.max(1, account.storageQuotaBytes)) * 100);
    console.log(
      account.email.padEnd(38) +
        `${formatBytes(account.storageBytes)} ${percent}%`.padStart(12) +
        formatBytes(account.storageQuotaBytes).padStart(12) +
        `${account.peopleCreated}/${account.peopleQuota}`.padStart(16),
    );
  }
}

await pool.end();
