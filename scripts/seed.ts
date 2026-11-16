import "./env";
import { randomBytes, scrypt } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  parentChild,
  partnerships,
  people,
  treeMembers,
  trees,
  users,
} from "../drizzle/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
const db = drizzle(pool);

function hashPassword(password: string) {
  return new Promise<string>((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(
      password,
      salt,
      64,
      { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) =>
        error ? reject(error) : resolve(`${salt.toString("hex")}:${key.toString("hex")}`),
    );
  });
}

try {
  const email = "demo@roots.local";
  let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        displayName: "Demo Zanca",
        passwordHash: await hashPassword("roots-demo-12345"),
        emailVerifiedAt: new Date(),
      })
      .returning();
  }

  const [tree] = await db
    .insert(trees)
    .values({
      name: "The Zanca family",
      description: "Four generations, two countries, and a lot of Sunday lunches.",
      createdBy: user.id,
    })
    .returning();

  await db.insert(treeMembers).values({ treeId: tree.id, userId: user.id, role: "owner" });

  const insertPerson = async (values: {
    firstName: string;
    lastName?: string;
    nickname?: string;
    maidenName?: string;
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
    bio?: string;
  }) => {
    const [person] = await db
      .insert(people)
      .values({
        treeId: tree.id,
        firstName: values.firstName,
        lastName: values.lastName ?? "Zanca",
        nickname: values.nickname ?? null,
        maidenName: values.maidenName ?? null,
        birthDate: values.birthDate ?? null,
        deathDate: values.deathDate ?? null,
        birthPlace: values.birthPlace ?? null,
        bio: values.bio ?? null,
        createdBy: user.id,
      })
      .returning();
    return person;
  };

  const giuseppe = await insertPerson({
    firstName: "Giuseppe",
    nickname: "Pippo",
    birthDate: "1928-03-14",
    deathDate: "2004-11-02",
    birthPlace: "Bari, Italy",
    bio: "A carpenter who kept every offcut of wood because it might be useful one day.",
  });
  const maria = await insertPerson({
    firstName: "Maria",
    maidenName: "Esposito",
    birthDate: "1931-07-19",
    deathDate: "2018-01-08",
    birthPlace: "Bari, Italy",
    bio: "Grew tomatoes, roses, and a family that still argues about sauce.",
  });
  const lucia = await insertPerson({
    firstName: "Lucia",
    birthDate: "1958-05-02",
    birthPlace: "Bari, Italy",
  });
  const marco = await insertPerson({
    firstName: "Marco",
    birthDate: "1961-09-23",
    birthPlace: "Bari, Italy",
  });
  const elena = await insertPerson({
    firstName: "Elena",
    birthDate: "1964-12-11",
    birthPlace: "Bari, Italy",
  });
  const david = await insertPerson({
    firstName: "David",
    lastName: "Zanca",
    birthDate: "1956-02-17",
    birthPlace: "Cleveland, Ohio",
    bio: "Met Lucia at a language class. Stayed for the food.",
  });
  const sofia = await insertPerson({
    firstName: "Sofia",
    lastName: "Conti",
    birthDate: "1965-06-30",
    birthPlace: "Naples, Italy",
  });
  const sam = await insertPerson({
    firstName: "Sam",
    birthDate: "1988-08-04",
    birthPlace: "Cleveland, Ohio",
    bio: "Keeps the digital copy of everything the family refuses to throw away.",
  });
  const mia = await insertPerson({
    firstName: "Mia",
    birthDate: "1991-04-27",
    birthPlace: "Cleveland, Ohio",
  });
  const leo = await insertPerson({
    firstName: "Leo",
    birthDate: "1995-10-15",
    birthPlace: "Milan, Italy",
  });

  const partnershipRows = [
    { a: giuseppe.id, b: maria.id, status: "married" as const },
    { a: david.id, b: lucia.id, status: "married" as const },
    { a: marco.id, b: sofia.id, status: "partnered" as const },
  ].map(({ a, b, status }) => {
    const [personAId, personBId] = [a, b].sort();
    return { treeId: tree.id, personAId, personBId, status };
  });
  await db.insert(partnerships).values(partnershipRows);

  await db.insert(parentChild).values([
    { treeId: tree.id, parentId: giuseppe.id, childId: lucia.id },
    { treeId: tree.id, parentId: maria.id, childId: lucia.id },
    { treeId: tree.id, parentId: giuseppe.id, childId: marco.id },
    { treeId: tree.id, parentId: maria.id, childId: marco.id },
    { treeId: tree.id, parentId: giuseppe.id, childId: elena.id },
    { treeId: tree.id, parentId: maria.id, childId: elena.id },
    { treeId: tree.id, parentId: lucia.id, childId: sam.id },
    { treeId: tree.id, parentId: david.id, childId: sam.id },
    { treeId: tree.id, parentId: lucia.id, childId: mia.id },
    { treeId: tree.id, parentId: david.id, childId: mia.id },
    { treeId: tree.id, parentId: marco.id, childId: leo.id },
    { treeId: tree.id, parentId: sofia.id, childId: leo.id },
  ]);

  console.log(`Seeded tree ${tree.id} for demo@roots.local (password: roots-demo-12345)`);
} finally {
  await pool.end();
}
