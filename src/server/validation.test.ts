import { describe, expect, it } from "vitest";
import { emailSchema, parentChildSchema, personSchema, registerSchema } from "./validation";

describe("validation", () => {
  it("normalizes email addresses", () => {
    expect(emailSchema.parse("  Sam@Example.COM ")).toBe("sam@example.com");
  });

  it("rejects weak passwords", () => {
    expect(registerSchema.safeParse({
      email: "sam@example.com",
      displayName: "Sam",
      password: "short",
    }).success).toBe(false);
  });

  it("turns empty optional dates into null", () => {
    const parsed = personSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      firstName: "Sam",
      lastName: "",
      birthDate: "",
      deathDate: "",
    });
    expect(parsed.birthDate).toBeNull();
    expect(parsed.deathDate).toBeNull();
    expect(parsed.lastName).toBe("");
  });

  it("rejects malformed dates", () => {
    const result = personSchema.safeParse({
      treeId: "00000000-0000-4000-8000-000000000000",
      firstName: "Sam",
      birthDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts parent-child relationships", () => {
    const parsed = parentChildSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      parentId: "00000000-0000-4000-8000-000000000001",
      childId: "00000000-0000-4000-8000-000000000002",
    });
    expect(parsed.parentType).toBe("biological");
  });
});
