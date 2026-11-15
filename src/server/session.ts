import { useSession } from "@solidjs/start/http";
import { getRequestEvent } from "solid-js/web";
import { env, isProduction } from "./config";

export const SESSION_COOKIE_NAME = "roots_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type RootsSession = {
  userId?: string;
};

const sessionConfig = {
  name: SESSION_COOKIE_NAME,
  password: env("SESSION_SECRET"),
  maxAge: SESSION_MAX_AGE,
  cookie: {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: isProduction,
  },
};

export function getSession() {
  return useSession<RootsSession>(sessionConfig);
}

export function getCurrentPath(): string {
  try {
    const event = getRequestEvent();
    if (!event) return "/trees";
    const url = new URL(event.request.url);
    return `${url.pathname}${url.search}`;
  } catch {
    return "/trees";
  }
}
