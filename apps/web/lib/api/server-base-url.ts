import "server-only";

import { resolveApiServerBaseUrl } from "@/lib/auth/session-cookie-refresh";

export function getApiServerBaseUrl() {
  return resolveApiServerBaseUrl();
}
