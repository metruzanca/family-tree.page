import { createHash, randomBytes } from "node:crypto";

const TOKEN_CONTEXT = "api-token:v1";

export const API_TOKEN_PREFIX = "rt_";

export function hashApiToken(token: string) {
  return createHash("sha256").update(`${TOKEN_CONTEXT}:${token}`).digest("hex");
}

export function generateApiToken() {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashApiToken(token),
  };
}
