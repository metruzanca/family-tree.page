import * as Sentry from "@sentry/node";

const globalForSentry = globalThis as unknown as {
  __familyTreeSentryStarted?: boolean;
};

function dsn() {
  return process.env.SENTRY_DSN?.trim() ?? "";
}

export function isServerSentryEnabled() {
  return Boolean(dsn());
}

export function initServerSentry() {
  const value = dsn();
  if (!value || globalForSentry.__familyTreeSentryStarted) return;

  Sentry.init({
    dsn: value,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },
  });

  globalForSentry.__familyTreeSentryStarted = true;
}

export function captureServerError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (!dsn()) return;
  initServerSentry();
  Sentry.withScope(scope => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}
