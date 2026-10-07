import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Must be created per request — never hoisted to module scope, or one user's
 * session could leak into another's request.
 *
 * The RLS policies are what actually restrict data; this client only carries
 * the user's session token.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
          // Cache-Control / Expires / Pragma — applied when we can.
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The session refresh is handled in proxy.ts, so this is safe to ignore.
          void headers;
        }
      },
    },
  });
}
