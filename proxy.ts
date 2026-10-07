import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { redirectWithCookies, updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed Middleware to Proxy; the behaviour is unchanged.
 *
 * This is an *optimistic* gate: it keeps unauthenticated users out of the app
 * shell for a good UX. It is NOT the security boundary — RLS in Postgres is.
 * Every page and query re-checks the session server-side.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/searches", "/leads"];
const AUTH_ROUTES = ["/login", "/signup"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Without credentials there is no auth to enforce — send the user to setup
  // instructions rather than crashing on every request.
  if (!isSupabaseConfigured()) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (pathname === "/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const { response, claims } = await updateSession(request);

  if (isProtected(pathname) && !claims) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return redirectWithCookies(loginUrl, response);
  }

  if (AUTH_ROUTES.includes(pathname) && claims) {
    return redirectWithCookies(new URL("/dashboard", request.url), response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
