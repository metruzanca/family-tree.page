import { definePlugin } from "nitro";
import { captureServerError, initServerSentry } from "../../src/server/sentry";

export default definePlugin(nitroApp => {
  initServerSentry();

  nitroApp.hooks.hook("error", (error, context) => {
    captureServerError(error, {
      source: "nitro",
      url: context?.event?.req?.url,
    });
  });
});
