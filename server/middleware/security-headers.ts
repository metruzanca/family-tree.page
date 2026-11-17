import { defineEventHandler, setResponseHeaders } from "nitro/h3";
import { isProduction } from "../../src/server/config";

/**
 * Baseline security headers.
 *
 * `Referrer-Policy: same-origin` matters for privacy: invite, password reset,
 * email verification, and calendar feed URLs carry secrets in the path, and a
 * cross-origin referrer would leak them to any external resource a page loads.
 * Same-origin is required for SolidStart server-function revalidation, which
 * reads the referer header after an action.
 */
export default defineEventHandler(event => {
  setResponseHeaders(event, {
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });

  if (isProduction) {
    setResponseHeaders(event, {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
  }

  const path = event.path || "";
  if (path.startsWith("/share/")) {
    setResponseHeaders(event, {
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "private, no-store",
    });
  }
});
