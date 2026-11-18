import { apiHandler, apiJson, apiOptions } from "~/server/api/http";

export const GET = apiHandler("tree:read", async (_event, context) =>
  apiJson({
    apiVersion: "v1",
    token: {
      id: context.token.id,
      name: context.token.name,
      prefix: context.token.tokenPrefix,
      scopes: context.token.scopes,
      createdAt: context.token.createdAt.toISOString(),
      expiresAt: context.token.expiresAt?.toISOString() ?? null,
      lastUsedAt: context.token.lastUsedAt?.toISOString() ?? null,
    },
    user: {
      id: context.user.id,
      displayName: context.user.displayName,
    },
    tree: {
      id: context.tree.id,
      name: context.tree.name,
    },
  }),
);

export const OPTIONS = apiOptions;
