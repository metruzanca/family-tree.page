"use server";

import { db } from "../server/db";
import {
  parentChild,
  partnerships,
  people,
  personEvents,
  treeMembers,
  trees,
} from "../../drizzle/schema";
import { requireUser, checkRateLimit } from "../server/auth-service";
import { AppError, runAction, type ActionResult } from "../server/errors";
import { importGedcomSchema } from "../server/validation";
import { parseGedcom, MAX_IMPORT_PEOPLE } from "../lib/gedcom-import";
import { recordUsage, reservePersonSlot } from "../server/usage";
import { logActivity } from "../server/activity";

export type GedcomImportSummary = {
  treeId: string;
  people: number;
  families: number;
  events: number;
  warnings: number;
};

/**
 * Imports a GEDCOM 5.5.1 file into a new tree. Importing into an existing tree
 * needs conflict and merge semantics that v1 deliberately does not guess at.
 */
export async function importGedcom(input: {
  treeName: string;
  fileName?: string | null;
  text: string;
}): Promise<ActionResult<GedcomImportSummary>> {
  return runAction("trees.importGedcom", async () => {
    const user = await requireUser();
    const parsedInput = importGedcomSchema.parse(input);

    if (!checkRateLimit("gedcom-import", user.email, 5, 60 * 60_000)) {
      throw new AppError("Too many imports. Try again in an hour.");
    }

    const parsed = parseGedcom(parsedInput.text);
    if (!parsed.people.length) {
      throw new AppError(
        "No people were found in that file. Check that it is a GEDCOM file with INDI records.",
      );
    }
    if (parsed.people.length > MAX_IMPORT_PEOPLE) {
      throw new AppError(
        `That file has ${parsed.people.length} people. The import limit is ${MAX_IMPORT_PEOPLE}.`,
      );
    }

    const result = await db.transaction(async tx => {
      const [tree] = await tx
        .insert(trees)
        .values({
          name: parsedInput.treeName,
          description: `Imported from ${parsedInput.fileName ?? "a GEDCOM file"}.`,
          createdBy: user.id,
        })
        .returning();
      await tx.insert(treeMembers).values({
        treeId: tree.id,
        userId: user.id,
        role: "owner",
      });

      const idByXref = new Map<string, string>();
      for (const person of parsed.people) {
        await reservePersonSlot(tx, user.id);
        const [created] = await tx
          .insert(people)
          .values({
            treeId: tree.id,
            firstName: person.firstName,
            lastName: person.lastName,
            maidenName: person.maidenName,
            nickname: person.nickname,
            sex: person.sex,
            birthDate: person.birthDate,
            deathDate: person.deathDate,
            birthPlace: person.birthPlace,
            deathPlace: person.deathPlace,
            bio: person.bio,
            createdBy: user.id,
          })
          .returning({ id: people.id });
        idByXref.set(person.xref, created.id);
      }

      for (const family of parsed.families) {
        const partnerIds = family.partnerXrefs
          .map(xref => idByXref.get(xref))
          .filter((id): id is string => Boolean(id));
        if (partnerIds.length === 2) {
          const [personAId, personBId] = [...partnerIds].sort();
          await tx
            .insert(partnerships)
            .values({
              treeId: tree.id,
              personAId,
              personBId,
              status: family.status,
              startDate: family.startDate,
              endDate: family.endDate,
            })
            .onConflictDoNothing();
        }
        for (const childXref of family.childXrefs) {
          const childId = idByXref.get(childXref);
          if (!childId) continue;
          for (const parentId of partnerIds) {
            await tx
              .insert(parentChild)
              .values({
                treeId: tree.id,
                parentId,
                childId,
                parentType: "biological",
              })
              .onConflictDoNothing();
          }
        }
      }

      for (const person of parsed.people) {
        const personId = idByXref.get(person.xref);
        if (!personId) continue;
        for (const event of person.events) {
          await tx.insert(personEvents).values({
            treeId: tree.id,
            personId,
            kind: event.kind,
            title: event.title,
            place: event.place,
            date: event.date,
            description: event.description,
            createdBy: user.id,
          });
        }
      }

      await logActivity(tx, {
        treeId: tree.id,
        actor: user,
        action: "tree.imported",
        entityType: "tree",
        entityId: tree.id,
        summary: `Imported ${parsed.people.length} ${
          parsed.people.length === 1 ? "person" : "people"
        } from GEDCOM`,
      });

      return tree.id;
    });

    await recordUsage({
      userId: user.id,
      kind: "tree_created",
      itemCount: 1,
      treeId: result,
    });
    await recordUsage({
      userId: user.id,
      kind: "person_created",
      itemCount: parsed.people.length,
      treeId: result,
    });

    return {
      treeId: result,
      people: parsed.stats.people,
      families: parsed.stats.families,
      events: parsed.stats.events,
      warnings: parsed.stats.warnings,
    };
  });
}
