import { type NextRequest, NextResponse } from "next/server";

import {
  refreshWebSessionCookies,
  resolveApiServerBaseUrl,
  type ParsedSetCookie,
} from "@/lib/auth/session-cookie-refresh";

const protectedPrefixes = ["/learn", "/admin"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function applyParsedCookies(
  response: NextResponse,
  cookies: ParsedSetCookie[],
) {
  for (const cookie of cookies) {
    if (
      cookie.name !== "pq_access" &&
      cookie.name !== "pq_refresh" &&
      cookie.name !== "pq_csrf"
    ) {
      continue;
    }
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      path: cookie.path ?? "/",
      maxAge: cookie.maxAge,
      httpOnly: cookie.httpOnly ?? false,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? "lax",
    });
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = isProtectedPath(pathname);
  const access = request.cookies.get("pq_access")?.value;
  const refresh = request.cookies.get("pq_refresh")?.value;
  const csrf = request.cookies.get("pq_csrf")?.value;

  if (isProtected && !access && !refresh) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isProtected && !access && refresh) {
    const refreshed = await refreshWebSessionCookies({
      apiBaseUrl: resolveApiServerBaseUrl(),
      cookieHeader: request.headers.get("cookie") ?? "",
      csrfToken: csrf,
    });

    if (refreshed.ok) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("cookie", refreshed.cookieHeader);
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      applyParsedCookies(response, refreshed.setCookies);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register", "/learn/:path*", "/admin/:path*"],
};
