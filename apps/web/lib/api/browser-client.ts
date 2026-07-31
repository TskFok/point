"use client";

import { createApiClient } from "@point-quest/api-client";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const pair = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  if (!pair) {
    return undefined;
  }

  try {
    return decodeURIComponent(pair.slice(prefix.length));
  } catch {
    return pair.slice(prefix.length);
  }
}

export const browserApiClient = createApiClient({
  baseUrl: apiBaseUrl,
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: "include",
    }),
  getCsrfToken: () => readCookie("pq_csrf"),
});
