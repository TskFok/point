import { type NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/learn", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const hasSessionCookie = Boolean(
    request.cookies.get("pq_access")?.value ||
      request.cookies.get("pq_refresh")?.value,
  );

  if (isProtected && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register", "/learn/:path*", "/admin/:path*"],
};
