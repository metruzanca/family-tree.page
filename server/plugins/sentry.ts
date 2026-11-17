import { definePlugin } from "nitro";
import { captureServerError, initServerSentry } from "../../src/server/sentry";

export default definePlugin(nitroApp => {
  initServerSentry();

  nitroApp.hooks.hook("error", (error, context) => {
    const eventContext = (context?.event as { context?: Record<string, unknown> } | undefined)
      ?.context;
    captureServerError(error, {
      source: "nitro",
      url: context?.event?.req?.url,
      requestId: eventContext?.requestId,
    });
  });
});
