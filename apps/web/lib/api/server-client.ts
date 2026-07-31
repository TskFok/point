import "server-only";

import { createApiClient } from "@point-quest/api-client";
import { cookies } from "next/headers";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export async function createServerApiClient() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  return createApiClient({
    baseUrl: apiBaseUrl,
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
