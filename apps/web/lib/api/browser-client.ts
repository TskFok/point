"use client";

import { createApiClient } from "@point-quest/api-client";

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
  baseUrl: "/api/v1",
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: "include",
    }),
  getCsrfToken: () => readCookie("pq_csrf"),
});
