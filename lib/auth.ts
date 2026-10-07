import { cache } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Reads the authenticated user from the Supabase session.
 *
 * Returns null when there is no valid session. The user id always comes from
 * the verified token — never from a URL, form field, or request body.
 *
 * Wrapped in React's cache() so the layout and the page it renders share one
 * token verification per request instead of verifying twice.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Without credentials there is no session to read, and constructing the
  // client would throw. Treated as signed out; the proxy sends the visitor to
  // /setup with instructions.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});

/**
 * Same as getSessionUser(), but sends unauthenticated visitors to the login
 * page. Use this in every page and Server Action that touches user data.
 */
export async function requireSessionUser(nextPath = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export interface Profile {
  id: string;
  fullName: string | null;
  createdAt: string;
}

/**
 * The profile row is created automatically by the handle_new_user() trigger.
 * If it is somehow missing we return null rather than failing the whole page —
 * the email from the session is enough to render the shell.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    createdAt: data.created_at,
  };
}
