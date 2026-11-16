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
        displayName: "Demo Simpson",
        passwordHash: await hashPassword("roots-demo-12345"),
        emailVerifiedAt: new Date(),
      })
      .returning();
  }

  const [tree] = await db
    .insert(trees)
    .values({
      name: "The Simpson family",
      description: "Three generations of Springfield's most famous family, plus the relatives who only show up at Thanksgiving.",
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
        lastName: values.lastName ?? "Simpson",
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

  const abe = await insertPerson({
    firstName: "Abraham",
    nickname: "Abe",
    birthDate: "1920-05-19",
    birthPlace: "Springfield",
    bio: "Talks to his hat, tells long stories about nothing, and keeps a drawer of things he will absolutely need later.",
  });
  const mona = await insertPerson({
    firstName: "Mona",
    maidenName: "Olsen",
    birthDate: "1929-03-11",
    birthPlace: "Springfield",
    bio: "Left in a hurry decades ago and still turns up at the worst possible moment.",
  });
  const clancy = await insertPerson({
    firstName: "Clancy",
    lastName: "Bouvier",
    birthDate: "1925-06-14",
    birthPlace: "Springfield",
    bio: "An airport security guard who took the job far too seriously.",
  });
  const jacqueline = await insertPerson({
    firstName: "Jacqueline",
    lastName: "Bouvier",
    maidenName: "Gurney",
    birthDate: "1928-11-20",
    birthPlace: "Springfield",
    bio: "Keeps a spotless house, a sharp tongue, and a strong opinion about everyone in it.",
  });
  const homer = await insertPerson({
    firstName: "Homer",
    birthDate: "1956-05-12",
    birthPlace: "Springfield",
    bio: "Works at the power plant, naps with great dedication, and considers himself the luckiest man alive.",
  });
  const herb = await insertPerson({
    firstName: "Herb",
    lastName: "Powell",
    birthDate: "1952-02-08",
    birthPlace: "Springfield",
    bio: "Homer's half brother, a one-time car magnate, and the only relative with a business plan.",
  });
  const marge = await insertPerson({
    firstName: "Marge",
    maidenName: "Bouvier",
    birthDate: "1954-10-01",
    birthPlace: "Springfield",
    bio: "Holds the family together with patience, a beehive of hair, and a surprisingly loud voice when needed.",
  });
  const patty = await insertPerson({
    firstName: "Patty",
    lastName: "Bouvier",
    birthDate: "1958-03-04",
    birthPlace: "Springfield",
    bio: "Marge's twin sister. Chain smoker, DMV employee, and never short of a comment about Homer.",
  });
  const selma = await insertPerson({
    firstName: "Selma",
    lastName: "Bouvier",
    birthDate: "1958-03-04",
    birthPlace: "Springfield",
    bio: "Patty's twin and Marge's other sister. Has tried marriage several times and is not done yet.",
  });
  const bart = await insertPerson({
    firstName: "Bart",
    birthDate: "1980-04-01",
    birthPlace: "Springfield",
    bio: "Ten years old forever, professionally underachieving, and secretly the most loyal one in the house.",
  });
  const lisa = await insertPerson({
    firstName: "Lisa",
    birthDate: "1982-05-09",
    birthPlace: "Springfield",
    bio: "Saxophone player, straight-A student, and the family's conscience whether they asked for one or not.",
  });
  const maggie = await insertPerson({
    firstName: "Maggie",
    birthDate: "1988-01-12",
    birthPlace: "Springfield",
    bio: "Has never said much, but nothing in that house gets past her.",
  });

  const partnershipRows = [
    { a: abe.id, b: mona.id, status: "married" as const },
    { a: clancy.id, b: jacqueline.id, status: "married" as const },
    { a: homer.id, b: marge.id, status: "married" as const },
  ].map(({ a, b, status }) => {
    const [personAId, personBId] = [a, b].sort();
    return { treeId: tree.id, personAId, personBId, status };
  });
  await db.insert(partnerships).values(partnershipRows);

  await db.insert(parentChild).values([
    { treeId: tree.id, parentId: abe.id, childId: homer.id },
    { treeId: tree.id, parentId: mona.id, childId: homer.id },
    { treeId: tree.id, parentId: abe.id, childId: herb.id },
    { treeId: tree.id, parentId: mona.id, childId: herb.id },
    { treeId: tree.id, parentId: clancy.id, childId: marge.id },
    { treeId: tree.id, parentId: jacqueline.id, childId: marge.id },
    { treeId: tree.id, parentId: clancy.id, childId: patty.id },
    { treeId: tree.id, parentId: jacqueline.id, childId: patty.id },
    { treeId: tree.id, parentId: clancy.id, childId: selma.id },
    { treeId: tree.id, parentId: jacqueline.id, childId: selma.id },
    { treeId: tree.id, parentId: homer.id, childId: bart.id },
    { treeId: tree.id, parentId: marge.id, childId: bart.id },
    { treeId: tree.id, parentId: homer.id, childId: lisa.id },
    { treeId: tree.id, parentId: marge.id, childId: lisa.id },
    { treeId: tree.id, parentId: homer.id, childId: maggie.id },
    { treeId: tree.id, parentId: marge.id, childId: maggie.id },
  ]);

  console.log(`Seeded tree ${tree.id} for demo@roots.local (password: roots-demo-12345)`);
} finally {
  await pool.end();
}
