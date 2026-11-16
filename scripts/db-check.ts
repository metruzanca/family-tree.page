import "./env";
import { Pool } from "pg";
import {
  MAX_PARENTS,
  analyzeRelationships,
  type AnalyzedRelationship,
} from "../src/lib/relationships";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  const [personRows, parentRows, partnerRows] = await Promise.all([
    pool.query<{ id: string; display_name: string }>(
      "select id, trim(first_name || ' ' || coalesce(last_name, '')) as display_name from people",
    ),
    pool.query<{ id: string; parent_id: string; child_id: string }>(
      "select id, parent_id, child_id from parent_child",
    ),
    pool.query<{ id: string; person_a_id: string; person_b_id: string }>(
      "select id, person_a_id, person_b_id from partnerships",
    ),
  ]);

  const names = new Map(personRows.rows.map(row => [row.id, row.display_name]));
  const relationships: AnalyzedRelationship[] = [
    ...parentRows.rows.map(row => ({
      id: row.id,
      type: "parent" as const,
      source: row.parent_id,
      target: row.child_id,
    })),
    ...partnerRows.rows.map(row => ({
      id: row.id,
      type: "partner" as const,
      source: row.person_a_id,
      target: row.person_b_id,
    })),
  ];

  const analysis = analyzeRelationships(
    personRows.rows.map(row => ({ id: row.id })),
    relationships,
  );

  const parentCounts = new Map<string, string[]>();
  for (const row of parentRows.rows) {
    const list = parentCounts.get(row.child_id) ?? [];
    list.push(row.parent_id);
    parentCounts.set(row.child_id, list);
  }
  const tooManyParents = [...parentCounts.entries()].filter(
    ([, parents]) => [...new Set(parents)].length > MAX_PARENTS,
  );

  for (const [personId, parents] of tooManyParents) {
    console.log(
      `Too many parents: ${names.get(personId) ?? personId} has ${new Set(parents).size}`,
    );
  }

  for (const conflict of analysis.conflicts) {
    if (conflict.kind === "partner-ancestor") {
      const [first, second] = conflict.personIds;
      console.log(
        `Partner is also an ancestor: ${names.get(first) ?? first} and ${names.get(second) ?? second} (partnership ${conflict.relationshipId})`,
      );
    } else {
      console.log(
        `Parent loop: ${conflict.personIds.map(id => names.get(id) ?? id).join(", ")} (${conflict.relationshipIds.join(", ")})`,
      );
    }
  }

  if (analysis.conflicts.length || tooManyParents.length) {
    console.error(
      `Found ${analysis.conflicts.length + tooManyParents.length} relationship problem(s).`,
    );
    process.exitCode = 1;
  } else {
    console.log("No relationship problems found.");
  }
} finally {
  await pool.end();
}
