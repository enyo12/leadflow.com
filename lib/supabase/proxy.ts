import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

export interface SessionClaims {
  sub: string;
  email?: string;
}

/**
 * Refreshes the Supabase session for this request and returns the verified claims.
 *
 * `getClaims()` revalidates the JWT rather than trusting the raw cookie, so the
 * result is safe to use for authorization. Never use `getSession()` here — it
 * reads the cookie without verifying it, which would let a forged cookie reach
 * another user's page.
 *
 * Runs in proxy.ts, which is the only place with both read and write access to
 * the response cookies.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  claims: SessionClaims | null;
}> {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Auth cookies must never be cached by a CDN or reverse proxy, or one
        // user's session token could be served to another.
        Object.entries(headers ?? {}).forEach(([header, value]) => {
          response.headers.set(header, value);
        });
      },
    },
  });

  // Must run before the response is generated, or a token refresh that
  // completes late cannot be written to the cookies.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return { response, claims: null };
  }

  return {
    response,
    claims: {
      sub: data.claims.sub,
      email: typeof data.claims.email === "string" ? data.claims.email : undefined,
    },
  };
}

/**
 * Redirects while keeping any session cookies set during refresh.
 * Dropping them would log the user out on the next request.
 */
export function redirectWithCookies(url: URL, response: NextResponse) {
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}
