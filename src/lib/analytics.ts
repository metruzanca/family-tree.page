type UmamiEventValue = string | number | boolean | null | undefined;
type UmamiEventData = Record<string, UmamiEventValue>;

declare global {
  interface Window {
    umami?: {
      track: {
        (
          props:
            | Record<string, unknown>
            | ((props: Record<string, unknown>) => Record<string, unknown>),
        ): void;
        (eventName: string, data?: UmamiEventData): void;
      };
    };
  }
}

/**
 * Every event the app is allowed to send. Keep this list small and free of
 * anything that identifies a person, a tree, a file, or an email address.
 */
export type AnalyticsEvent =
  | "album_deleted"
  | "album_renamed"
  | "calendar_feed_created"
  | "client_error"
  | "calendar_feed_disabled"
  | "file_date_taken_set"
  | "file_deleted"
  | "file_people_tagged"
  | "invite_accepted"
  | "invite_created"
  | "media_uploaded"
  | "person_created"
  | "person_deleted"
  | "person_updated"
  | "portrait_removed"
  | "portrait_set"
  | "relationship_added"
  | "relationship_removed"
  | "tree_created"
  | "tree_deleted"
  | "tree_left";

type AnalyticsPayloads = {
  album_deleted: undefined;
  album_renamed: undefined;
  calendar_feed_created: undefined;
  calendar_feed_disabled: undefined;
  client_error: { name: string };
  file_date_taken_set: { cleared: boolean };
  file_deleted: { album: boolean };
  file_people_tagged: { count: number };
  invite_accepted: undefined;
  invite_created: { role: string; delivery: "email" | "link" };
  media_uploaded: { count: number; album: boolean; size_bucket?: string };
  person_created: undefined;
  person_deleted: undefined;
  person_updated: undefined;
  portrait_removed: undefined;
  portrait_set: undefined;
  relationship_added: { relation: string; mode: string };
  relationship_removed: { relation: string };
  tree_created: undefined;
  tree_deleted: undefined;
  tree_left: undefined;
};

const PAYLOAD_KEYS: Record<AnalyticsEvent, readonly string[]> = {
  album_deleted: [],
  album_renamed: [],
  calendar_feed_created: [],
  calendar_feed_disabled: [],
  client_error: ["name"],
  file_date_taken_set: ["cleared"],
  file_deleted: ["album"],
  file_people_tagged: ["count"],
  invite_accepted: [],
  invite_created: ["role", "delivery"],
  media_uploaded: ["count", "album", "size_bucket"],
  person_created: [],
  person_deleted: [],
  person_updated: [],
  portrait_removed: [],
  portrait_set: [],
  relationship_added: ["relation", "mode"],
  relationship_removed: ["relation"],
  tree_created: [],
  tree_deleted: [],
  tree_left: [],
};

/**
 * The only page paths that may reach analytics. Anything with a token, a tree
 * id, a person id, or a file id in the path is collapsed to a stable label.
 * Unknown paths are not sent at all.
 */
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/privacy",
  "/terms",
]);

const TOKEN_PREFIXES: Array<[string, string]> = [
  ["/invite/", "/invite"],
  ["/reset-password/", "/reset-password"],
  ["/verify-email/", "/verify-email"],
  ["/change-email/", "/change-email"],
  ["/share/", "/share"],
];

export function sanitizePagePath(pathname: string): string | null {
  let path = pathname.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) return null;
  if (path.length > 1) path = path.replace(/\/+$/, "");

  if (PUBLIC_PATHS.has(path)) return path;
  for (const [prefix, label] of TOKEN_PREFIXES) {
    if (path === prefix.slice(0, -1) || path.startsWith(prefix)) return label;
  }
  if (path === "/trees" || path.startsWith("/trees/")) return "/app";
  if (path === "/settings" || path.startsWith("/settings/")) return "/app";
  if (path === "/demo" || path.startsWith("/demo/")) return "/demo";
  return null;
}

export function sizeBucket(bytes: number): string {
  if (bytes < 1_000_000) return "under_1mb";
  if (bytes < 10_000_000) return "1_to_10mb";
  if (bytes < 50_000_000) return "10_to_50mb";
  return "over_50mb";
}

function cleanData(
  event: AnalyticsEvent,
  data: Record<string, unknown> | undefined,
): UmamiEventData | undefined {
  if (!data) return undefined;
  const allowed = PAYLOAD_KEYS[event];
  const clean: UmamiEventData = {};
  let hasValue = false;

  for (const key of allowed) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      clean[key] = value;
      hasValue = true;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
      hasValue = true;
    } else if (typeof value === "string") {
      clean[key] = value.slice(0, 100);
      hasValue = true;
    }
  }

  return hasValue ? clean : undefined;
}

export function track<E extends AnalyticsEvent>(
  eventName: E,
  data?: AnalyticsPayloads[E],
) {
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami) return;
  const payload = cleanData(eventName, data as Record<string, unknown> | undefined);
  if (payload) umami.track(eventName, payload);
  else umami.track(eventName);
}

/**
 * Pageviews are sent by hand so the URL can be reduced to a safe label.
 * Automatic pageviews are disabled in the document head.
 */
export function trackPageview(pathname: string) {
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami) return;
  const path = sanitizePagePath(pathname);
  if (!path) return;
  const url = `${window.location.origin}${path}`;
  umami.track(props => ({ ...props, url }));
}
