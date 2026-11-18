import type { APIEvent } from "@solidjs/start/server";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import type { ApiScope } from "../../lib/api";
import { AppError, localizedMessage } from "../errors";
import { currentRequestId } from "../request-context";
import { log } from "../logger";
import { optionalEnv } from "../config";
import { checkApiRateLimit } from "../rate-limit";
import {
  bearerToken,
  resolveApiToken,
  type ApiPrincipal,
} from "../api-tokens";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiContext = ApiPrincipal & {
  scopes: Set<ApiScope>;
};

export type ApiHandler = (
  event: APIEvent,
  context: ApiContext,
) => Promise<Response> | Response;

function allowedOrigins() {
  return optionalEnv("API_ALLOWED_ORIGINS", "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers();
  if (!origin) return headers;

  headers.set("Vary", "Origin");
  if (!allowedOrigins().includes(origin)) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

export function apiOptions(event: APIEvent) {
  const headers = corsHeaders(event.request);
  headers.set("Content-Length", "0");
  return new Response(null, { status: 204, headers });
}

function applyCors(response: Response, request: Request) {
  const headers = corsHeaders(request);
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
}

export function apiJson(
  data: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers,
  });
}

export function apiError(status: number, message: string, code: string) {
  const reference = currentRequestId()?.slice(0, 8);
  return apiJson(
    {
      ok: false,
      error: message,
      code,
      ...(reference ? { reference } : {}),
    },
    { status },
  );
}

function unauthorized(code: string, message: string) {
  const response = apiError(401, message, code);
  response.headers.set("WWW-Authenticate", `Bearer error="${code}"`);
  return response;
}

/**
 * Wraps a read-only API route with token auth, scope checks, rate limiting,
 * CORS, and a consistent error envelope.
 */
export function apiHandler(scope: ApiScope, handler: ApiHandler) {
  return async (event: APIEvent): Promise<Response> => {
    try {
      const raw = bearerToken(event.request);
      if (!raw) {
        return applyCors(
          unauthorized("missing_token", "Provide a bearer API token."),
          event.request,
        );
      }

      const resolved = await resolveApiToken(raw);
      if (!resolved.ok) {
        return applyCors(
          unauthorized(resolved.code, resolved.message),
          event.request,
        );
      }

      const context: ApiContext = {
        ...resolved.principal,
        scopes: new Set(resolved.principal.token.scopes),
      };

      if (!context.scopes.has(scope)) {
        return applyCors(
          apiError(
            403,
            `This token does not have the ${scope} scope.`,
            "insufficient_scope",
          ),
          event.request,
        );
      }

      const limited = checkApiRateLimit(context.token.id);
      if (!limited.allowed) {
        const response = apiError(
          429,
          "Too many requests. Try again shortly.",
          "rate_limited",
        );
        response.headers.set(
          "Retry-After",
          String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))),
        );
        response.headers.set("X-RateLimit-Limit", String(limited.limit));
        response.headers.set("X-RateLimit-Remaining", "0");
        return applyCors(response, event.request);
      }

      const response = await handler(event, context);
      response.headers.set("X-RateLimit-Limit", String(limited.limit));
      response.headers.set("X-RateLimit-Remaining", String(limited.remaining));
      return applyCors(response, event.request);
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof ApiError) {
        log.warn("api.rejected", {
          status: error.status,
          code: error.code,
          error: error.message,
        });
        return applyCors(
          apiError(error.status, error.message, error.code),
          event.request,
        );
      }
      if (error instanceof AppError) {
        return applyCors(
          apiError(error.status, localizedMessage(error.message, "en"), "request_failed"),
          event.request,
        );
      }
      if (error instanceof ZodError) {
        const message = localizedMessage(error.issues[0]?.message ?? "Invalid request.", "en");
        return applyCors(apiError(400, message, "invalid_request"), event.request);
      }
      log.error("api.failed", { error });
      return applyCors(
        apiError(500, "The request could not be completed.", "internal_error"),
        event.request,
      );
    }
  };
}

/** A token is bound to one tree, so a path mismatch is a 404, not a 403. */
export function requireTokenTree(event: APIEvent, context: ApiContext) {
  const treeId = event.params.treeId;
  if (!treeId || treeId !== context.tree.id) {
    throw new ApiError(404, "That tree is not available to this token.", "not_found");
  }
  return context.tree;
}

export function notFound(message = "Not found.") {
  return new ApiError(404, message, "not_found");
}

export function weakEtag(...parts: Array<string | number | Date | null | undefined>) {
  const hash = createHash("sha256")
    .update(parts.map(part => (part instanceof Date ? part.toISOString() : String(part ?? ""))).join(":"))
    .digest("hex")
    .slice(0, 32);
  return `W/"${hash}"`;
}

export function etagMatches(request: Request, etag: string) {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header
    .split(",")
    .map(value => value.trim())
    .some(value => value === etag || value === "*");
}

export function notModified(etag: string) {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      "Cache-Control": "private, no-cache",
    },
  });
}

