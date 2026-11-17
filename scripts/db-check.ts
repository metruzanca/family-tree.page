import "./env";
import { Pool } from "pg";
import {
  MAX_PARENTS,
  analyzeRelationships,
  type AnalyzedRelationship,
} from "../src/lib/relationships";
import {
  findDuplicateCandidates,
  type DuplicatePerson,
} from "../src/lib/duplicates";
import type { FuzzyDate } from "../src/lib/fuzzy-date";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  const [personRows, parentRows, partnerRows] = await Promise.all([
    pool.query<{
      id: string;
      tree_id: string;
      tree_name: string;
      display_name: string;
      first_name: string;
      last_name: string;
      maiden_name: string | null;
      nickname: string | null;
      birth_date: FuzzyDate | null;
      death_date: FuzzyDate | null;
    }>(
      "select p.id, p.tree_id, t.name as tree_name, trim(p.first_name || ' ' || coalesce(p.last_name, '')) as display_name, p.first_name, p.last_name, p.maiden_name, p.nickname, p.birth_date, p.death_date from people p join trees t on t.id = p.tree_id",
    ),
    pool.query<{ id: string; parent_id: string; child_id: string }>(
      "select id, parent_id, child_id from parent_child",
    ),
    pool.query<{ id: string; person_a_id: string; person_b_id: string }>(
      "select id, person_a_id, person_b_id from partnerships",
    ),
  ]);

  const names = new Map(personRows.rows.map(row => [row.id, row.display_name]));

  const peopleByTree = new Map<
    string,
    { treeName: string; people: DuplicatePerson[] }
  >();
  for (const row of personRows.rows) {
    const entry = peopleByTree.get(row.tree_id) ?? {
      treeName: row.tree_name,
      people: [],
    };
    entry.people.push({
      id: row.id,
      displayName: row.display_name || "Unnamed person",
      firstName: row.first_name,
      lastName: row.last_name,
      maidenName: row.maiden_name,
      nickname: row.nickname,
      birthDate: row.birth_date,
      deathDate: row.death_date,
    });
    peopleByTree.set(row.tree_id, entry);
  }

  const seenPairs = new Set<string>();
  let duplicateCount = 0;
  for (const { treeName, people: treePeople } of peopleByTree.values()) {
    for (const person of treePeople) {
      const matches = findDuplicateCandidates(person, treePeople, {
        excludePersonId: person.id,
        limit: 3,
      });
      for (const match of matches) {
        const pair = [person.id, match.id].sort().join(":");
        if (seenPairs.has(pair)) continue;
        seenPairs.add(pair);
        duplicateCount += 1;
        console.log(
          `Possible duplicate in ${treeName}: ${person.displayName} and ${match.displayName} (${match.reasons.join(", ")})`,
        );
      }
    }
  }
  if (duplicateCount) {
    console.log(
      `Possible duplicates: ${duplicateCount}. Review these before merging anyone in the app.`,
    );
  }
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
