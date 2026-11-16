import { describe, expect, it } from "vitest";
import {
  birthdayMessage,
  escapeHtml,
  inviteMessage,
  passwordResetMessage,
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
      url: "https://roots.test/verify-email/abc",
      expiresInHours: 24,
    });
    expect(message.subject).toContain("Verify");
    expect(message.html).toContain("https://roots.test/verify-email/abc");
    expect(message.text).toContain("https://roots.test/verify-email/abc");
    expect(message.text).toContain("24 hours");
  });

  it("includes the reset link and warns about the short lifetime", () => {
    const message = passwordResetMessage({
      name: "Sam",
      url: "https://roots.test/reset-password/abc",
      expiresInMinutes: 60,
    });
    expect(message.html).toContain("https://roots.test/reset-password/abc");
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
      url: "https://roots.test/trees",
    });
    expect(message.subject).toContain("this week");
    expect(message.html).toContain("&lt;Mia&gt; Simpson");
    expect(message.html).toContain("&quot;Simpson&quot;");
    expect(message.html).toContain("turns 35 on April 27");
    expect(message.text).toContain("Mia");
    expect(message.text).toContain("https://roots.test/trees");
  });

  it("uses a plural subject for several birthdays", () => {
    const message = birthdayMessage({
      name: "Sam",
      kind: "day_of",
      entries: [
        { personName: "Mia", treeName: "Family", date: "April 27", age: 35 },
        { personName: "Leo", treeName: "Family", date: "April 27", age: 31 },
      ],
      url: "https://roots.test/trees",
    });
    expect(message.subject).toContain("2 birthdays today");
    expect(message.html).toContain("Birthdays today");
  });

  it("escapes tree names and inviter names in invitations", () => {
    const message = inviteMessage({
      treeName: '<b>The "Simpson" family</b>',
      inviterName: "Sam <sam@example.com>",
      role: "editor",
      url: "https://roots.test/invite/abc",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
    expect(message.subject).toContain("invited you to");
    expect(message.subject).not.toContain("\n");
    expect(message.html).not.toContain("<b>The");
    expect(message.html).toContain("&lt;b&gt;The");
    expect(message.text).toContain("editor");
    expect(message.text).toContain("https://roots.test/invite/abc");
  });
});
