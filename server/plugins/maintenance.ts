import { log } from "../../src/server/logger";
import { definePlugin } from "nitro";
import { runMaintenance } from "../../src/server/maintenance";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60_000;

type MaintenanceGlobal = typeof globalThis & {
  __familyTreeMaintenanceTimer?: ReturnType<typeof setInterval>;
  __familyTreeMaintenanceRunning?: boolean;
  __familyTreeMaintenanceDay?: string;
};

/**
 * Runs retention and stale upload cleanup once per UTC day.
 *
 * The app already assumes a single long-lived process for presence. Repeated
 * runs are harmless: every delete is idempotent, and the stale upload cleanup
 * only touches rows that are more than a day old.
 */
export default definePlugin(nitroApp => {
  if (process.env.NODE_ENV !== "production" && process.env.MAINTENANCE !== "on") {
    return;
  }

  const global = globalThis as MaintenanceGlobal;
  if (global.__familyTreeMaintenanceTimer) return;

  async function tick() {
    if (global.__familyTreeMaintenanceRunning) return;
    const today = new Date().toISOString().slice(0, 10);
    if (global.__familyTreeMaintenanceDay === today) return;

    global.__familyTreeMaintenanceRunning = true;
    try {
      const summary = await runMaintenance();
      global.__familyTreeMaintenanceDay = today;
      log.info("maintenance.completed", { ...summary });
    } catch (error) {
      log.error("maintenance.failed", { error });
    } finally {
      global.__familyTreeMaintenanceRunning = false;
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
  global.__familyTreeMaintenanceTimer = timer;

  nitroApp.hooks.hook("close", () => {
    clearTimeout(startup);
    clearInterval(timer);
    delete global.__familyTreeMaintenanceTimer;
    delete global.__familyTreeMaintenanceRunning;
    delete global.__familyTreeMaintenanceDay;
  });
});
