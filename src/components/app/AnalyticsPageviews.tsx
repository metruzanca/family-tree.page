import { createEffect } from "solid-js";
import { useLocation } from "@solidjs/router";
import { trackPageview } from "~/lib/analytics";

/**
 * Sends pageviews by hand so paths never include invite, reset, verify, or
 * tree identifiers. Automatic pageviews are disabled in the document head.
 */
export function AnalyticsPageviews() {
  const location = useLocation();
  let lastPath = "";

  createEffect(() => {
    const path = location.pathname;
    if (!path || path === lastPath) return;
    lastPath = path;
    trackPageview(path);
  });

  return null;
}
