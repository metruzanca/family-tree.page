"use server";

import { and, eq } from "drizzle-orm";
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
import { requireTreeMember } from "../server/guards";
import { AppError, runAction, type ActionResult } from "../server/errors";
import {
  applyGedcomImportSchema,
  importGedcomSchema,
} from "../server/validation";
import { parseGedcom, MAX_IMPORT_PEOPLE } from "../lib/gedcom-import";
import { planImport } from "../lib/gedcom-plan";
import { loadApiTreeData } from "../server/api/data";
import { recordUsage, reservePersonSlot } from "../server/usage";
import { logActivity } from "../server/activity";
import { touchTree } from "../server/file-service";

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


export type GedcomMergeSummary = {
  treeId: string;
  created: number;
  merged: number;
  skipped: number;
  parentLinks: number;
  partnerships: number;
  events: number;
};

/**
 * Applies reviewed decisions to an existing tree. New people are created,
 * merged people only have empty fields filled, and existing relationships and
 * identical events are left alone.
 */
export async function applyGedcomImport(input: {
  treeId: string;
  fileName?: string | null;
  text: string;
  decisions: Array<{
    xref: string;
    action: "create" | "merge" | "skip";
    personId?: string | null;
  }>;
}): Promise<ActionResult<GedcomMergeSummary>> {
  return runAction("trees.applyGedcomImport", async () => {
    const access = await requireTreeMember(input.treeId, "editor");
    const parsedInput = applyGedcomImportSchema.parse(input);

    if (!checkRateLimit("gedcom-merge", access.user.email, 10, 60 * 60_000)) {
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

    const data = await loadApiTreeData(access.tree);
    const plan = planImport({
      parsed,
      existingPeople: data.people.map(person => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        maidenName: person.maidenName,
        nickname: person.nickname,
        sex: person.sex,
        birthDate: person.birthDate ?? null,
        deathDate: person.deathDate ?? null,
        birthPlace: person.birthPlace,
        deathPlace: person.deathPlace,
        bio: person.bio,
      })),
      existingEvents: data.events.map(event => ({
        personId: event.personId,
        kind: event.kind,
        title: event.title,
        place: event.place,
        description: event.description,
        date: event.date ?? null,
      })),
      decisions: parsedInput.decisions,
    });

    if (plan.errors.length) {
      throw new AppError(plan.errors[0]);
    }
    if (!plan.counts.create && !plan.counts.merge) {
      throw new AppError("Nothing would be imported. Choose at least one person to add or merge.");
    }

    const result = await db.transaction(async tx => {
      const idByXref = new Map<string, string>();

      for (const person of plan.creates) {
        await reservePersonSlot(tx, access.user.id);
        const [created] = await tx
          .insert(people)
          .values({
            treeId: access.tree.id,
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
            createdBy: access.user.id,
          })
          .returning({ id: people.id });
        idByXref.set(person.xref, created.id);
      }

      for (const merge of plan.merges) {
        idByXref.set(merge.imported.xref, merge.personId);
        if (Object.keys(merge.update).length) {
          await tx
            .update(people)
            .set({ ...merge.update, updatedAt: new Date() })
            .where(
              and(
                eq(people.id, merge.personId),
                eq(people.treeId, access.tree.id),
              ),
            );
        }
      }

      let parentLinks = 0;
      let partnershipCount = 0;
      for (const family of plan.families) {
        const partnerIds = family.partnerXrefs
          .map(xref => idByXref.get(xref))
          .filter((id): id is string => Boolean(id));
        if (partnerIds.length === 2) {
          const [personAId, personBId] = [...partnerIds].sort();
          const inserted = await tx
            .insert(partnerships)
            .values({
              treeId: access.tree.id,
              personAId,
              personBId,
              status: family.status,
              startDate: family.startDate,
              endDate: family.endDate,
            })
            .onConflictDoNothing()
            .returning({ id: partnerships.id });
          partnershipCount += inserted.length;
        }
        for (const childXref of family.childXrefs) {
          const childId = idByXref.get(childXref);
          if (!childId) continue;
          for (const parentId of partnerIds) {
            if (parentId === childId) continue;
            const inserted = await tx
              .insert(parentChild)
              .values({
                treeId: access.tree.id,
                parentId,
                childId,
                parentType: "biological",
              })
              .onConflictDoNothing()
              .returning({ id: parentChild.id });
            parentLinks += inserted.length;
          }
        }
      }

      let eventCount = 0;
      for (const planned of plan.events) {
        const personId = idByXref.get(planned.xref);
        if (!personId) continue;
        await tx.insert(personEvents).values({
          treeId: access.tree.id,
          personId,
          kind: planned.event.kind,
          title: planned.event.title,
          place: planned.event.place,
          date: planned.event.date,
          description: planned.event.description,
          createdBy: access.user.id,
        });
        eventCount += 1;
      }

      const summary =
        plan.counts.create && plan.counts.merge
          ? `Added ${plan.counts.create} and merged ${plan.counts.merge} people from GEDCOM`
          : plan.counts.create
            ? `Imported ${plan.counts.create} ${plan.counts.create === 1 ? "person" : "people"} from GEDCOM`
            : `Merged ${plan.counts.merge} ${plan.counts.merge === 1 ? "person" : "people"} from GEDCOM`;
      await logActivity(tx, {
        treeId: access.tree.id,
        actor: access.user,
        action: "tree.imported",
        entityType: "tree",
        entityId: access.tree.id,
        summary,
      });

      return {
        created: plan.creates.length,
        merged: plan.merges.length,
        skipped: plan.skips.length,
        parentLinks,
        partnerships: partnershipCount,
        events: eventCount,
      };
    });

    await touchTree(access.tree.id);
    if (result.created) {
      await recordUsage({
        userId: access.user.id,
        kind: "person_created",
        itemCount: result.created,
        treeId: access.tree.id,
      });
    }

    return { treeId: access.tree.id, ...result };
  });
}
