import { roleLabel } from "../lib/format";

const BRAND = {
  ink: "#22331f",
  cream: "#f5efe2",
  paper: "#fffdf8",
  body: "#3f4a3b",
  muted: "#6d7768",
  line: "#e2ddcf",
  gold: "#c49a45",
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function subjectLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export type EmailMessage = {
  subject: string;
  html: string;
  text: string;
};

type LayoutInput = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
  signOff?: string;
};

function layout(input: LayoutInput) {
  const paragraphs = input.paragraphs
    .map(
      paragraph =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.body};">${paragraph}</p>`,
    )
    .join("");
  const url = escapeHtml(input.ctaUrl);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${BRAND.cream};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.paper};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;background:${BRAND.ink};color:${BRAND.cream};font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.4px;">
                family-tree
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:${BRAND.ink};font-weight:600;">${escapeHtml(input.heading)}</h1>
                ${paragraphs}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
                  <tr>
                    <td style="border-radius:10px;background:${BRAND.ink};">
                      <a href="${url}" style="display:inline-block;padding:13px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${BRAND.cream};text-decoration:none;border-radius:10px;">${escapeHtml(input.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted};">If the button does not work, copy this link into your browser:</p>
                <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;color:${BRAND.body};">${url}</p>
                <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(input.footnote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="border-top:1px solid ${BRAND.line};padding-top:16px;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                  ${escapeHtml(input.signOff ?? "A private place for family trees. Be careful with links from this email.")}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function verifyEmailMessage(input: {
  name: string;
  url: string;
  expiresInHours: number;
}): EmailMessage {
  return {
    subject: "Verify your email for family-tree",
    html: layout({
      preheader: "Confirm your email address to finish setting up family-tree.",
      heading: "Confirm your email",
      paragraphs: [
        `Hi ${escapeHtml(input.name)},`,
        "Confirm this address so we can reach you about your family tree, password, and invitations.",
      ],
      ctaLabel: "Verify my email",
      ctaUrl: input.url,
      footnote: `This link works once and expires in ${input.expiresInHours} hours. If you did not create a family-tree account, you can ignore this email.`,
    }),
    text: [
      `Hi ${input.name},`,
      "",
      "Confirm this address so we can reach you about your family tree, password, and invitations.",
      "",
      input.url,
      "",
      `This link works once and expires in ${input.expiresInHours} hours. If you did not create a family-tree account, you can ignore this email.`,
    ].join("\n"),
  };
}

export function passwordResetMessage(input: {
  name: string;
  url: string;
  expiresInMinutes: number;
}): EmailMessage {
  return {
    subject: "Reset your family-tree password",
    html: layout({
      preheader: "Use this link to choose a new password.",
      heading: "Choose a new password",
      paragraphs: [
        `Hi ${escapeHtml(input.name)},`,
        "Someone asked to reset the password for your family-tree account. Choose a new one with the button below.",
      ],
      ctaLabel: "Reset my password",
      ctaUrl: input.url,
      footnote: `This link works once and expires in ${input.expiresInMinutes} minutes. If you did not ask for a reset, ignore this email and your password stays the same.`,
      signOff: "Reset links are sensitive. Nobody at family-tree will ever ask you for a password or a reset link.",
    }),
    text: [
      `Hi ${input.name},`,
      "",
      "Someone asked to reset the password for your family-tree account. Choose a new one with the link below.",
      "",
      input.url,
      "",
      `This link works once and expires in ${input.expiresInMinutes} minutes. If you did not ask for a reset, ignore this email and your password stays the same.`,
    ].join("\n"),
  };
}

export function emailChangeConfirmationMessage(input: {
  name: string;
  newEmail: string;
  url: string;
  expiresInHours: number;
}): EmailMessage {
  const newEmail = escapeHtml(input.newEmail);
  return {
    subject: "Confirm your new email for family-tree",
    html: layout({
      preheader: `Confirm ${input.newEmail} as the email address on your account.`,
      heading: "Confirm your new email",
      paragraphs: [
        `Hi ${escapeHtml(input.name)},`,
        `Use the button below to make <strong style="color:${BRAND.ink};">${newEmail}</strong> the email address on your family-tree account.`,
        "Your current address keeps working until you confirm this link.",
      ],
      ctaLabel: "Confirm new email",
      ctaUrl: input.url,
      footnote: `This link works once and expires in ${input.expiresInHours} hours. If you did not ask for this change, ignore this email and your address stays the same.`,
    }),
    text: [
      `Hi ${input.name},`,
      "",
      `Use this link to make ${input.newEmail} the email address on your family-tree account:`,
      "",
      input.url,
      "",
      "Your current address keeps working until you confirm this link.",
      "",
      `This link works once and expires in ${input.expiresInHours} hours. If you did not ask for this change, ignore this email and your address stays the same.`,
    ].join("\n"),
  };
}

export function emailChangeNoticeMessage(input: {
  name: string;
  newEmail: string;
  url: string;
}): EmailMessage {
  const newEmail = escapeHtml(input.newEmail);
  return {
    subject: "Your family-tree email address is being changed",
    html: layout({
      preheader: "Someone asked to change the email address on your account.",
      heading: "Email change requested",
      paragraphs: [
        `Hi ${escapeHtml(input.name)},`,
        `Someone asked to change the email address on your family-tree account to <strong style="color:${BRAND.ink};">${newEmail}</strong>.`,
        "The change only happens after the new address confirms the link we sent there.",
      ],
      ctaLabel: "Review account settings",
      ctaUrl: input.url,
      footnote:
        "If this was not you, reset your password and review your account. Nobody at family-tree will ever ask you for your password.",
    }),
    text: [
      `Hi ${input.name},`,
      "",
      `Someone asked to change the email address on your family-tree account to ${input.newEmail}.`,
      "The change only happens after the new address confirms the link we sent there.",
      "",
      input.url,
      "",
      "If this was not you, reset your password and review your account. Nobody at family-tree will ever ask you for your password.",
    ].join("\n"),
  };
}

export type BirthdayEmailKind = "week_before" | "day_before" | "day_of";

export function birthdayMessage(input: {
  name: string;
  kind: BirthdayEmailKind;
  entries: {
    personName: string;
    treeName: string;
    date: string;
    age: number | null;
  }[];
  url: string;
}): EmailMessage {
  const when =
    input.kind === "day_of"
      ? "today"
      : input.kind === "day_before"
        ? "tomorrow"
        : "this week";
  const heading =
    input.kind === "day_of"
      ? "Birthdays today"
      : input.kind === "day_before"
        ? "Birthdays tomorrow"
        : "Birthdays this week";
  const subject =
    input.entries.length === 1
      ? `A birthday ${when} on family-tree`
      : `${input.entries.length} birthdays ${when} on family-tree`;

  const listItems = input.entries.map(entry => {
    const name = escapeHtml(entry.personName);
    const tree = escapeHtml(entry.treeName);
    const date = escapeHtml(entry.date);
    const timing =
      input.kind === "day_of"
        ? "today"
        : input.kind === "day_before"
          ? "tomorrow"
          : `on ${date}`;
    const detail =
      entry.age === null
        ? `has a birthday ${timing}`
        : `turns ${entry.age} ${timing}`;
    return `<li style="margin:0 0 10px;font-size:15px;line-height:1.6;color:${BRAND.body};"><strong style="color:${BRAND.ink};">${name}</strong> ${detail} in ${tree}.</li>`;
  });

  const textLines = input.entries.map(entry => {
    const timing =
      input.kind === "day_of"
        ? "today"
        : input.kind === "day_before"
          ? "tomorrow"
          : `on ${entry.date}`;
    return entry.age === null
      ? `- ${entry.personName} has a birthday ${timing} in ${entry.treeName}.`
      : `- ${entry.personName} turns ${entry.age} ${timing} in ${entry.treeName}.`;
  });

  return {
    subject: subjectLine(subject),
    html: layout({
      preheader:
        input.entries.length === 1
          ? `A birthday ${when} in your family tree.`
          : `${input.entries.length} birthdays ${when} in your family trees.`,
      heading,
      paragraphs: [
        `Hi ${escapeHtml(input.name)},`,
        `<ul style="margin:0 0 16px;padding:0 0 0 18px;">${listItems.join("")}</ul>`,
      ],
      ctaLabel: "Open your trees",
      ctaUrl: input.url,
      footnote:
        "You are receiving this because birthday reminders are on in your family-tree account. You can change them any time in Account settings.",
    }),
    text: [
      `Hi ${input.name},`,
      "",
      heading,
      "",
      ...textLines,
      "",
      input.url,
      "",
      "You are receiving this because birthday reminders are on in your family-tree account. You can change them any time in Account settings.",
    ].join("\n"),
  };
}

export function inviteMessage(input: {
  treeName: string;
  inviterName: string;
  role: "owner" | "editor" | "viewer";
  url: string;
  expiresAt: Date;
}): EmailMessage {
  const expires = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(input.expiresAt);
  const role = roleLabel(input.role).toLowerCase();
  const treeName = escapeHtml(input.treeName);
  const inviterName = escapeHtml(input.inviterName);

  return {
    subject: subjectLine(`${input.inviterName} invited you to ${input.treeName} on family-tree`),
    html: layout({
      preheader: `${input.inviterName} invited you to join ${input.treeName} as ${role}.`,
      heading: `Join ${treeName}`,
      paragraphs: [
        `${inviterName} invited you to help grow the family tree <strong style="color:${BRAND.ink};">${treeName}</strong> as ${role}.`,
        "Your family's people, photographs, and documents stay in one private graph. You can sign in or create an account when you open the link.",
      ],
      ctaLabel: "Open the invitation",
      ctaUrl: input.url,
      footnote: `This invitation works once and expires on ${expires}. If you were not expecting it, you can ignore this email.`,
    }),
    text: [
      `${input.inviterName} invited you to help grow the family tree "${input.treeName}" as ${role}.`,
      "",
      "Your family's people, photographs, and documents stay in one private graph. You can sign in or create an account when you open the link.",
      "",
      input.url,
      "",
      `This invitation works once and expires on ${expires}. If you were not expecting it, you can ignore this email.`,
    ].join("\n"),
  };
}

function longDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function treeDeletionRequestedMessage(input: {
  treeName: string;
  requesterName: string;
  url: string;
  expiresAt: Date;
}): EmailMessage {
  const treeName = escapeHtml(input.treeName);
  const requesterName = escapeHtml(input.requesterName);
  const expires = longDate(input.expiresAt);

  return {
    subject: subjectLine(
      `${input.requesterName} asked to delete ${input.treeName} on family-tree`,
    ),
    html: layout({
      preheader: `${input.requesterName} asked to delete ${input.treeName}. Every owner must approve.`,
      heading: "A tree deletion needs your approval",
      paragraphs: [
        `${requesterName} asked to delete <strong style="color:${BRAND.ink};">${treeName}</strong>.`,
        "Every owner of the tree must approve before anything is scheduled. If one owner does not approve, nothing happens.",
        `The request expires on ${expires}. You can review it in the tree's Danger tab.`,
      ],
      ctaLabel: "Review the request",
      ctaUrl: input.url,
      footnote:
        "This is a transactional safety email about a tree you own. If you did not expect it, open the tree and cancel the request.",
    }),
    text: [
      `${input.requesterName} asked to delete "${input.treeName}".`,
      "",
      "Every owner of the tree must approve before anything is scheduled. If one owner does not approve, nothing happens.",
      "",
      `The request expires on ${expires}. Review it with this link:`,
      "",
      input.url,
      "",
      "If you did not expect this, open the tree and cancel the request.",
    ].join("\n"),
  };
}

export function treeDeletionScheduledMessage(input: {
  treeName: string;
  purgeAt: Date;
  url: string;
}): EmailMessage {
  const treeName = escapeHtml(input.treeName);
  const purge = longDate(input.purgeAt);

  return {
    subject: subjectLine(`"${input.treeName}" is scheduled for deletion on family-tree`),
    html: layout({
      preheader: `${input.treeName} will be permanently erased on ${purge}. Any owner can restore it before then.`,
      heading: "A tree is scheduled for deletion",
      paragraphs: [
        `Every owner approved deleting <strong style="color:${BRAND.ink};">${treeName}</strong>.`,
        `The tree and everything in it will be permanently erased on ${purge}. Until then it is locked, and any owner can restore it from Your trees.`,
      ],
      ctaLabel: "Open your trees",
      ctaUrl: input.url,
      footnote:
        "This is a transactional safety email about a tree you belong to. No action is needed if you agree with the deletion.",
    }),
    text: [
      `Every owner approved deleting "${input.treeName}".`,
      "",
      `The tree and everything in it will be permanently erased on ${purge}. Until then it is locked, and any owner can restore it.`,
      "",
      input.url,
      "",
      "No action is needed if you agree with the deletion.",
    ].join("\n"),
  };
}

export function treeDeletionReminderMessage(input: {
  treeName: string;
  purgeAt: Date;
  url: string;
}): EmailMessage {
  const treeName = escapeHtml(input.treeName);
  const purge = longDate(input.purgeAt);

  return {
    subject: subjectLine(
      `Last chance to restore "${input.treeName}" on family-tree`,
    ),
    html: layout({
      preheader: `${input.treeName} will be permanently erased on ${purge}.`,
      heading: "One week before permanent deletion",
      paragraphs: [
        `<strong style="color:${BRAND.ink};">${treeName}</strong> is scheduled to be erased on ${purge}.`,
        "This is the reminder before the purge. Any owner can restore the tree until then. After the purge, the people, photographs, documents, and history are gone for good.",
      ],
      ctaLabel: "Restore the tree",
      ctaUrl: input.url,
      footnote:
        "This is a transactional safety email about a tree you belong to. You received it because you are a member of the tree.",
    }),
    text: [
      `"${input.treeName}" is scheduled to be erased on ${purge}.`,
      "",
      "This is the reminder before the purge. Any owner can restore the tree until then. After the purge, the people, photographs, documents, and history are gone for good.",
      "",
      input.url,
      "",
      "You received this because you are a member of the tree.",
    ].join("\n"),
  };
}
