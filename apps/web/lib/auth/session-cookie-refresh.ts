export type ParsedSetCookie = {
  name: string;
  value: string;
  path?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

type HeadersWithSetCookie = {
  getSetCookie?: () => string[];
  get: (name: string) => string | null;
};

export function resolveApiServerBaseUrl(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const configured = env.API_SERVER_BASE_URL?.trim();
  return (configured || "http://localhost:3000/api/v1").replace(/\/+$/, "");
}

export function parseSetCookieHeaders(
  headers: Headers | HeadersWithSetCookie,
): ParsedSetCookie[] {
  const headersWithSetCookie = headers as HeadersWithSetCookie;
  const raw =
    headersWithSetCookie.getSetCookie?.() ??
    (headersWithSetCookie.get("set-cookie")
      ? [headersWithSetCookie.get("set-cookie") as string]
      : []);

  return raw.filter(Boolean).map((line) => {
    const parts = line.split(";").map((part) => part.trim());
    const [nameValue, ...attributes] = parts;
    const eq = nameValue.indexOf("=");
    const name = eq === -1 ? nameValue : nameValue.slice(0, eq);
    const value = eq === -1 ? "" : nameValue.slice(eq + 1);
    const parsed: ParsedSetCookie = { name, value, httpOnly: false };
    for (const attribute of attributes) {
      const separator = attribute.indexOf("=");
      const key =
        separator === -1 ? attribute : attribute.slice(0, separator);
      const rawValue =
        separator === -1 ? undefined : attribute.slice(separator + 1);
      const normalized = key.trim().toLowerCase();
      if (normalized === "path" && rawValue !== undefined) {
        parsed.path = rawValue;
      }
      if (normalized === "max-age" && rawValue !== undefined) {
        parsed.maxAge = Number(rawValue);
      }
      if (normalized === "httponly") {
        parsed.httpOnly = true;
      }
      if (normalized === "secure") {
        parsed.secure = true;
      }
      if (normalized === "samesite" && rawValue !== undefined) {
        const site = rawValue.trim().toLowerCase();
        if (site === "lax" || site === "strict" || site === "none") {
          parsed.sameSite = site;
        }
      }
    }
    return parsed;
  });
}

export function mergeRequestCookieHeader(
  existing: string | undefined,
  updates: Record<string, string>,
): string {
  const map = new Map<string, string>();
  for (const pair of (existing ?? "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  for (const [name, value] of Object.entries(updates)) {
    map.set(name, value);
  }
  return [...map.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function refreshWebSessionCookies(input: {
  apiBaseUrl: string;
  cookieHeader: string;
  csrfToken?: string;
  fetch?: typeof fetch;
}): Promise<
  | { ok: true; setCookies: ParsedSetCookie[]; cookieHeader: string }
  | { ok: false }
> {
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: input.cookieHeader,
  };
  if (input.csrfToken) {
    headers["X-CSRF-Token"] = input.csrfToken;
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `${input.apiBaseUrl.replace(/\/+$/, "")}/auth/refresh`,
      {
        method: "POST",
        headers,
        body: "{}",
        cache: "no-store",
      },
    );
  } catch {
    return { ok: false };
  }

  if (!response.ok) {
    return { ok: false };
  }

  const setCookies = parseSetCookieHeaders(response.headers);
  const updates: Record<string, string> = {};
  for (const cookie of setCookies) {
    if (
      cookie.name === "pq_access" ||
      cookie.name === "pq_refresh" ||
      cookie.name === "pq_csrf"
    ) {
      updates[cookie.name] = cookie.value;
    }
  }
  return {
    ok: true,
    setCookies,
    cookieHeader: mergeRequestCookieHeader(input.cookieHeader, updates),
  };
}
