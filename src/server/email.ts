import { Resend } from "resend";
import { env, isProduction } from "./config";
import type { EmailMessage } from "./email-templates";

let client: Resend | null = null;
let clientKey: string | null = null;

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function getClient() {
  const key = env("RESEND_API_KEY").trim();
  if (!client || clientKey !== key) {
    client = new Resend(key);
    clientKey = key;
  }
  return client;
}

export type SendEmailResult =
  | { delivered: true; simulated?: false }
  | { delivered: false; simulated: true; reason: "not_configured" }
  | { delivered: false; simulated?: false; reason: "not_configured" | "failed" };

/**
 * Sends a transactional email through Resend.
 *
 * In development, when Resend is not configured, the message is printed to the
 * server console so verification, reset, and invite links still work locally.
 * Failures are reported to the caller instead of throwing, so a mail outage
 * never breaks account creation.
 */
export async function sendEmail(to: string, message: EmailMessage): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    if (isProduction) {
      console.error(`Cannot send "${message.subject}" to ${to}: RESEND_API_KEY is not set.`);
      return { delivered: false, reason: "not_configured" };
    }
    console.info(
      [
        "",
        "──────────── DEV EMAIL (not sent) ────────────",
        `To: ${to}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return { delivered: false, simulated: true, reason: "not_configured" };
  }

  let from: string;
  try {
    from = env("RESEND_FROM_EMAIL").trim();
  } catch (error) {
    console.error("Cannot send email: RESEND_FROM_EMAIL is not set.", error);
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const { error } = await getClient().emails.send({
      from,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      console.error(`Resend rejected "${message.subject}" to ${to}:`, error);
      return { delivered: false, reason: "failed" };
    }
    return { delivered: true };
  } catch (error) {
    console.error(`Could not send "${message.subject}" to ${to}:`, error);
    return { delivered: false, reason: "failed" };
  }
}
