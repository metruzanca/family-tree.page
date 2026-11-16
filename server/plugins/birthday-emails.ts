import { definePlugin } from "nitro";
import { sendBirthdayNotifications } from "../../src/server/birthday-notifications";
import { captureServerError } from "../../src/server/sentry";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 30_000;

type BirthdaySchedulerGlobal = typeof globalThis & {
  __familyTreeBirthdayTimer?: ReturnType<typeof setInterval>;
  __familyTreeBirthdayRunning?: boolean;
};

/**
 * Sends birthday digests once a day after the configured UTC hour.
 *
 * The app already assumes a single long-lived process for presence. The
 * birthday_email_log unique constraint still makes repeated runs, restarts,
 * and accidental duplicate replicas safe.
 */
export default definePlugin(nitroApp => {
  if (process.env.BIRTHDAY_EMAILS === "off") return;
  if (process.env.NODE_ENV !== "production" && process.env.BIRTHDAY_EMAILS !== "on") {
    return;
  }

  const global = globalThis as BirthdaySchedulerGlobal;
  if (global.__familyTreeBirthdayTimer) return;

  const configuredHour = Number(process.env.BIRTHDAY_EMAIL_HOUR_UTC ?? "8");
  const targetHour =
    Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23
      ? configuredHour
      : 8;

  async function tick() {
    if (global.__familyTreeBirthdayRunning) return;
    if (new Date().getUTCHours() < targetHour) return;
    global.__familyTreeBirthdayRunning = true;
    try {
      const summary = await sendBirthdayNotifications();
      if (summary.emailsSent || summary.emailsFailed) {
        console.info(
          `Birthday emails: ${summary.emailsSent} sent, ${summary.emailsSkipped} skipped, ${summary.emailsFailed} failed, ${summary.usersNotified} people notified.`,
        );
      }
    } catch (error) {
      console.error("Birthday email run failed", error);
      captureServerError(error, { source: "birthday-emails" });
    } finally {
      global.__familyTreeBirthdayRunning = false;
    }
  }

  const startup = setTimeout(() => {
    void tick();
  }, STARTUP_DELAY_MS);
  const timer = setInterval(() => {
    void tick();
  }, CHECK_INTERVAL_MS);

  startup.unref?.();
  timer.unref?.();
  global.__familyTreeBirthdayTimer = timer;

  nitroApp.hooks.hook("close", () => {
    clearTimeout(startup);
    clearInterval(timer);
    delete global.__familyTreeBirthdayTimer;
    delete global.__familyTreeBirthdayRunning;
  });
});
