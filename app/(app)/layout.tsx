import { AppShell } from "@/components/app-shell";
import { getProfile, getSessionUser } from "@/lib/auth";
import { missingSupabaseEnvVars } from "@/lib/supabase/config";
import { redirect } from "next/navigation";

/**
 * Authenticated application shell (navigation + page container).
 *
 * proxy.ts keeps unauthenticated traffic out of these routes, but that check is
 * optimistic only — it is re-verified here against the session before anything
 * user-specific is rendered.
 *
 * Every page below is per-user, so the whole segment is rendered on demand.
 * Without this, Next would prerender the subtree at build time — with no
 * credentials present that bakes a redirect into the HTML that would then be
 * served to signed-in users too.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (missingSupabaseEnvVars().length > 0) {
    redirect("/setup");
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile(user.id);

  return (
    <AppShell userEmail={user.email} displayName={profile?.fullName ?? null}>
      {children}
    </AppShell>
  );
}
