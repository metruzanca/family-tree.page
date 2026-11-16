type SentryBrowser = typeof import("@sentry/browser");

let client: SentryBrowser | null = null;
let loading: Promise<SentryBrowser | null> | null = null;

function dsn() {
  return typeof window === "undefined" ? "" : (import.meta.env.VITE_SENTRY_DSN?.trim() ?? "");
}

export function isClientSentryEnabled() {
  return Boolean(dsn());
}

async function loadSentry(): Promise<SentryBrowser | null> {
  const value = dsn();
  if (!value) return null;
  if (client) return client;
  if (loading) return loading;

  loading = import("@sentry/browser")
    .then(module => {
      module.init({
        dsn: value,
        environment:
          import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
        release: import.meta.env.VITE_RELEASE?.trim() || undefined,
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
      client = module;
      return module;
    })
    .catch(error => {
      console.warn("Could not start Sentry in the browser", error);
      return null;
    });

  return loading;
}

export function initClientSentry() {
  void loadSentry();
}

export async function captureClientError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const Sentry = await loadSentry();
  if (!Sentry) return;
  Sentry.withScope(scope => {
    for (const [key, value] of Object.entries(context)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}
