import { describe, expect, it } from "vitest";
import { exactFuzzyDate } from "../lib/fuzzy-date";
import {
  addManualFaceSchema,
  deleteAccountSchema,
  emailChangeSchema,
  emailSchema,
  fileTagsSchema,
  fileTakenAtSchema,
  forgotPasswordSchema,
  inviteEmailSchema,
  parentChildSchema,
  personSchema,
  recordFacesSchema,
  registerSchema,
  resetPasswordSchema,
  updateNotificationSettingsSchema,
} from "./validation";

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
      birthDate: null,
      deathDate: null,
    });
    expect(parsed.birthDate).toBeNull();
    expect(parsed.deathDate).toBeNull();
    expect(parsed.lastName).toBe("");
  });

  it("accepts partial and approximate dates", () => {
    const parsed = personSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      firstName: "Sam",
      birthDate: { start: { year: 1952, month: null, day: null }, qualifier: "about" },
      deathDate: {
        start: { year: 1990, month: null, day: null },
        end: { year: 2001, month: null, day: null },
        qualifier: "between",
      },
    });
    expect(parsed.birthDate).toEqual({
      start: { year: 1952, month: null, day: null },
      end: null,
      qualifier: "about",
    });
    expect(parsed.deathDate?.qualifier).toBe("between");
    expect(parsed.deathDate?.end?.year).toBe(2001);
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

  it("normalizes invite email addresses", () => {
    expect(inviteEmailSchema.parse(" Cousin@Example.COM ")).toBe("cousin@example.com");
    expect(inviteEmailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("requires a valid email for a password reset request", () => {
    expect(forgotPasswordSchema.safeParse({ email: "sam@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("requires booleans for birthday notification settings", () => {
    expect(
      updateNotificationSettingsSchema.safeParse({
        notifyBirthdayWeekBefore: false,
        notifyBirthdayDayBefore: true,
        notifyBirthdayDayOf: true,
      }).success,
    ).toBe(true);
    expect(
      updateNotificationSettingsSchema.safeParse({
        notifyBirthdayWeekBefore: "yes",
        notifyBirthdayDayBefore: false,
        notifyBirthdayDayOf: true,
      }).success,
    ).toBe(false);
  });

  it("requires matching passwords when resetting", () => {
    const base = {
      token: "abc123",
      password: "a-long-new-password",
      confirmPassword: "a-long-new-password",
    };
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ ...base, confirmPassword: "something-else" }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ ...base, password: "short", confirmPassword: "short" })
        .success,
    ).toBe(false);
  });

  it("dedupes tagged people", () => {
    const parsed = fileTagsSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
      personIds: [
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
      ],
    });
    expect(parsed.personIds).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("allows clearing photo tags", () => {
    const parsed = fileTagsSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
    });
    expect(parsed.personIds).toEqual([]);
  });

  it("rejects non-uuid tagged people", () => {
    expect(
      fileTagsSchema.safeParse({
        treeId: "00000000-0000-4000-8000-000000000000",
        fileId: "00000000-0000-4000-8000-000000000001",
        personIds: ["grandma"],
      }).success,
    ).toBe(false);
  });

  it("accepts and clears a photo date taken", () => {
    const base = {
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
    };
    expect(
      fileTakenAtSchema.parse({
        ...base,
        takenAt: exactFuzzyDate(1962, 4, 18),
      }).takenAt,
    ).toEqual({ ...exactFuzzyDate(1962, 4, 18), end: null });
    expect(fileTakenAtSchema.parse({ ...base, takenAt: null }).takenAt).toBeNull();
    expect(fileTakenAtSchema.safeParse({ ...base, takenAt: "spring 1962" }).success).toBe(
      false,
    );
  });

  it("normalizes the new email when requesting a change", () => {
    const parsed = emailChangeSchema.parse({
      newEmail: " New.Address@Example.COM ",
      currentPassword: "a-current-password",
    });
    expect(parsed.newEmail).toBe("new.address@example.com");
  });

  it("requires a password to change the email", () => {
    expect(
      emailChangeSchema.safeParse({ newEmail: "new@example.com", currentPassword: "" }).success,
    ).toBe(false);
  });

  it("requires a password and typed confirmation to delete an account", () => {
    expect(
      deleteAccountSchema.safeParse({
        password: "a-current-password",
        confirmation: "sam@example.com",
      }).success,
    ).toBe(true);
    expect(
      deleteAccountSchema.safeParse({ password: "", confirmation: "sam@example.com" }).success,
    ).toBe(false);
    expect(
      deleteAccountSchema.safeParse({ password: "a-current-password", confirmation: "" }).success,
    ).toBe(false);
  });

  it("accepts detected face boxes inside the image", () => {
    const parsed = recordFacesSchema.parse({
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
      faces: [
        {
          box: { x: 0.1, y: 0.2, width: 0.2, height: 0.25 },
          confidence: 0.91,
        },
      ],
    });
    expect(parsed.faces).toHaveLength(1);
  });

  it("rejects face boxes that leave the image or are too small", () => {
    const base = {
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
    };
    expect(
      recordFacesSchema.safeParse({
        ...base,
        faces: [{ box: { x: 0.9, y: 0.1, width: 0.2, height: 0.2 } }],
      }).success,
    ).toBe(false);
    expect(
      recordFacesSchema.safeParse({
        ...base,
        faces: [{ box: { x: 0.1, y: 0.1, width: 0.01, height: 0.01 } }],
      }).success,
    ).toBe(false);
  });

  it("caps the faces stored for one photo", () => {
    const faces = Array.from({ length: 26 }, () => ({
      box: { x: 0, y: 0, width: 0.1, height: 0.1 },
    }));
    expect(
      recordFacesSchema.safeParse({
        treeId: "00000000-0000-4000-8000-000000000000",
        fileId: "00000000-0000-4000-8000-000000000001",
        faces,
      }).success,
    ).toBe(false);
  });

  it("requires a person when a box is drawn by hand", () => {
    const base = {
      treeId: "00000000-0000-4000-8000-000000000000",
      fileId: "00000000-0000-4000-8000-000000000001",
      personId: "00000000-0000-4000-8000-000000000002",
      box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    };
    expect(addManualFaceSchema.safeParse(base).success).toBe(true);
    expect(
      addManualFaceSchema.safeParse({ ...base, personId: "grandma" }).success,
    ).toBe(false);
  });
});
