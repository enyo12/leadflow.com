import { createClient } from "@/lib/supabase/server";
import type { DashboardStats } from "@/types";

/**
 * Dashboard counts, derived from the signed-in user's own rows.
 *
 * RLS restricts every query to the current user; the explicit `user_id`
 * filters make that intent legible and keep the query correct even if a
 * policy is later relaxed.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  const [searchesResult, leadsResult] = await Promise.all([
    supabase
      .from("searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("leads")
      .select("analyzed_at, fit_score")
      .eq("user_id", userId),
  ]);

  if (searchesResult.error || leadsResult.error) {
    const message = searchesResult.error?.message ?? leadsResult.error?.message ?? "";
    console.error("[leadflow] getDashboardStats failed:", message);
    throw new Error("We could not load your dashboard right now. Please try again.");
  }

  const rows = (leadsResult.data ?? []) as {
    analyzed_at: string | null;
    fit_score: number | string | null;
  }[];

  const scores = rows
    .filter((row) => row.analyzed_at !== null && row.fit_score !== null)
    .map((row) => Number(row.fit_score))
    .filter((score) => Number.isFinite(score));

  return {
    totalSearches: searchesResult.count ?? 0,
    totalLeads: rows.length,
    analyzedLeads: scores.length,
    averageScore:
      scores.length === 0
        ? null
        : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
  };
}
