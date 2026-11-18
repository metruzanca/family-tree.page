import "./env";
import { pool } from "../src/server/db";
import { purgeTree, treeDeletionAudit } from "../src/server/tree-deletion";

/**
 * Permanently erase one tree and its storage objects, outside the normal
 * 30 day grace period.
 *
 * This is the operator escape hatch for a legal erasure request, or for
 * cleaning up a tree that is already past its purge date. It is deliberately
 * not exposed in the app.
 *
 * Usage:
 *   pnpm tsx scripts/purge-tree.ts <treeId> --yes [--force]
 *
 * `--force` also allows purging a tree that is not marked for deletion.
 */
const args = process.argv.slice(2).filter(argument => argument !== "--");
const [treeId, ...flags] = args;
const confirmed = flags.includes("--yes");
const force = flags.includes("--force");

if (!treeId) {
  console.error("Usage: pnpm tsx scripts/purge-tree.ts <treeId> --yes [--force]");
  process.exit(1);
}

if (!confirmed) {
  console.error("Refusing to purge without --yes. This permanently erases the tree.");
  process.exit(1);
}

const audit = await treeDeletionAudit(treeId);
if (!audit) {
  console.error(`No tree found with id ${treeId}.`);
  await pool.end();
  process.exit(1);
}

if (!audit.tree.deletedAt && !force) {
  console.error(
    `"${audit.tree.name}" is not scheduled for deletion. Add --force to erase it anyway.`,
  );
  await pool.end();
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      tree: audit.tree,
      hasFiles: audit.hasFiles,
      forced: force,
    },
    null,
    2,
  ),
);

const result = await purgeTree(treeId, { force });
console.log(result);
await pool.end();
