import { describe, expect, it } from "vitest";
import {
  deleteAccountSchema,
  emailChangeSchema,
  emailSchema,
  fileTagsSchema,
  fileTakenAtSchema,
  forgotPasswordSchema,
  inviteEmailSchema,
  parentChildSchema,
  personSchema,
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
    expect(fileTakenAtSchema.parse({ ...base, takenAt: "1962-04-18" }).takenAt).toBe(
      "1962-04-18",
    );
    expect(fileTakenAtSchema.parse({ ...base, takenAt: "" }).takenAt).toBeNull();
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
});
