"use server";

import { requireUser, type PublicUser } from "../server/auth-service";

export async function requireUserPage(): Promise<PublicUser> {
  return requireUser();
}
