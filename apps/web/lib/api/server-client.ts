import "server-only";

import { createApiClient } from "@point-quest/api-client";
import { cookies } from "next/headers";

function apiServerBaseUrl() {
  const configured = process.env.API_SERVER_BASE_URL?.trim();
  return (configured || "http://localhost:3000/api/v1").replace(/\/+$/, "");
}

export async function createServerApiClient() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return createApiClient({
    baseUrl: apiServerBaseUrl(),
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (cookieHeader) {
        headers.set("Cookie", cookieHeader);
      }

      return fetch(input, {
        ...init,
        cache: "no-store",
        headers,
      });
    },
    getCsrfToken: () => cookieStore.get("pq_csrf")?.value,
  });
}
