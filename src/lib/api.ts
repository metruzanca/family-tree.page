export const API_SCOPES = [
  {
    value: "tree:read",
    label: "Tree",
    description: "Tree name, description, and counts.",
  },
  {
    value: "people:read",
    label: "People",
    description: "People, relationships, events, and search.",
  },
  {
    value: "media:read",
    label: "Media",
    description: "Photo and document thumbnails and downloads.",
  },
  {
    value: "changes:read",
    label: "Changes",
    description: "The tree activity feed and a since cursor.",
  },
  {
    value: "export:read",
    label: "Export",
    description: "A full JSON snapshot of the tree.",
  },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["value"];

export const API_SCOPE_VALUES = API_SCOPES.map(scope => scope.value) as [
  ApiScope,
  ...ApiScope[],
];

export const DEFAULT_API_SCOPES: ApiScope[] = API_SCOPES.map(scope => scope.value);

export function isApiScope(value: unknown): value is ApiScope {
  return (
    typeof value === "string" &&
    API_SCOPES.some(scope => scope.value === value)
  );
}

export function scopeLabel(scope: ApiScope) {
  return API_SCOPES.find(entry => entry.value === scope)?.label ?? scope;
}

/** The token prefix is stored so owners can tell tokens apart. */
export const API_TOKEN_PREFIX = "rt_";

export const API_VERSION = "1.0.0";
