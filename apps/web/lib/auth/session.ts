import "server-only";

import { ApiClientError } from "@point-quest/api-client";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createServerApiClient } from "@/lib/api/server-client";

export type AppRole = "ADMIN" | "STUDENT";

export const getCurrentSession = cache(async () => {
  const client = await createServerApiClient();

  try {
    return await client.getCurrentUser();
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      (error.status === 401 || error.status === 403)
    ) {
      return null;
    }
    throw error;
  }
});

export async function requireRole(role: AppRole) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== role) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/learn");
  }

  return session;
}
