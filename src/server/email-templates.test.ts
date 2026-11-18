import { describe, expect, it } from "vitest";
import {
  birthdayMessage,
  escapeHtml,
  inviteMessage,
  passwordResetMessage,
  treeDeletionReminderMessage,
  treeDeletionRequestedMessage,
  treeDeletionScheduledMessage,
  verifyEmailMessage,
} from "./email-templates";

describe("email templates", () => {
  it("escapes user-supplied html", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quoted'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;",
    );
  });

  it("includes the verification link in html and text", () => {
    const message = verifyEmailMessage({
      name: "Sam",
      url: "https://family-tree.test/verify-email/abc",
      expiresInHours: 24,
    });
    expect(message.subject).toContain("Verify");
    expect(message.html).toContain("https://family-tree.test/verify-email/abc");
    expect(message.text).toContain("https://family-tree.test/verify-email/abc");
    expect(message.text).toContain("24 hours");
  });

  it("includes the reset link and warns about the short lifetime", () => {
    const message = passwordResetMessage({
      name: "Sam",
      url: "https://family-tree.test/reset-password/abc",
      expiresInMinutes: 60,
    });
    expect(message.html).toContain("https://family-tree.test/reset-password/abc");
    expect(message.text).toContain("60 minutes");
  });

  it("builds a birthday digest and escapes names", () => {
    const message = birthdayMessage({
      name: "Sam",
      kind: "week_before",
      entries: [
        {
          personName: "<Mia> Simpson",
          treeName: 'The "Simpson" family',
          date: "April 27",
          age: 35,
        },
      ],
      url: "https://family-tree.test/trees",
    });
    expect(message.subject).toContain("this week");
    expect(message.html).toContain("&lt;Mia&gt; Simpson");
    expect(message.html).toContain("&quot;Simpson&quot;");
    expect(message.html).toContain("turns 35 on April 27");
    expect(message.text).toContain("Mia");
    expect(message.text).toContain("https://family-tree.test/trees");
  });

  it("omits the age when the birth year is unknown", () => {
    const message = birthdayMessage({
      name: "Sam",
      kind: "day_of",
      entries: [
        { personName: "Mia", treeName: "Family", date: "April 27", age: null },
      ],
      url: "https://family-tree.test/trees",
    });
    expect(message.html).toContain("has a birthday today");
    expect(message.text).toContain("has a birthday today");
    expect(message.html).not.toContain("turns");
  });

  it("uses a plural subject for several birthdays", () => {
    const message = birthdayMessage({
      name: "Sam",
      kind: "day_of",
      entries: [
        { personName: "Mia", treeName: "Family", date: "April 27", age: 35 },
        { personName: "Leo", treeName: "Family", date: "April 27", age: 31 },
      ],
      url: "https://family-tree.test/trees",
    });
    expect(message.subject).toContain("2 birthdays today");
    expect(message.html).toContain("Birthdays today");
  });

  it("escapes tree names and inviter names in invitations", () => {
    const message = inviteMessage({
      treeName: '<b>The "Simpson" family</b>',
      inviterName: "Sam <sam@example.com>",
      role: "editor",
      url: "https://family-tree.test/invite/abc",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    expect(message.subject).toContain("invited you to");
    expect(message.subject).not.toContain("\n");
    expect(message.html).not.toContain("<b>The");
    expect(message.html).toContain("&lt;b&gt;The");
    expect(message.text).toContain("editor");
    expect(message.text).toContain("https://family-tree.test/invite/abc");
  });

  it("names the tree and approver in a deletion request", () => {
    const message = treeDeletionRequestedMessage({
      treeName: '<b>The "Simpson" family</b>',
      requesterName: "Sam <sam@example.com>",
      url: "https://family-tree.test/trees/123/settings?tab=danger",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    expect(message.subject).toContain("asked to delete");
    expect(message.subject).not.toContain("\n");
    expect(message.html).not.toContain("<b>The");
    expect(message.html).toContain("&lt;b&gt;The");
    expect(message.html).toContain("Every owner");
    expect(message.text).toContain("Every owner");
    expect(message.text).toContain("January 1, 2030");
    expect(message.text).toContain("https://family-tree.test/trees/123/settings?tab=danger");
  });

  it("gives the purge date and restore path in a scheduled deletion", () => {
    const message = treeDeletionScheduledMessage({
      treeName: "The Simpsons",
      purgeAt: new Date("2030-01-31T00:00:00Z"),
      url: "https://family-tree.test/trees",
    });
    expect(message.subject).toContain("scheduled for deletion");
    expect(message.text).toContain("January 31, 2030");
    expect(message.text).toContain("restore");
    expect(message.text).toContain("https://family-tree.test/trees");
  });

  it("warns before the purge in the reminder", () => {
    const message = treeDeletionReminderMessage({
      treeName: "The Simpsons",
      purgeAt: new Date("2030-01-31T00:00:00Z"),
      url: "https://family-tree.test/trees",
    });
    expect(message.subject).toContain("Last chance");
    expect(message.html).toContain("January 31, 2030");
    expect(message.text).toContain("gone for good");
    expect(message.text).toContain("https://family-tree.test/trees");
  });
});
