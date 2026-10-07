import { createClient } from "@/lib/supabase/server";
import { COMPANY_SIZES, type CompanySize, type Search } from "@/types";

interface SearchRow {
  id: string;
  industry: string;
  location: string;
  company_size: string;
  created_at: string;
}

function toCompanySize(value: string): CompanySize {
  return COMPANY_SIZES.some((option) => option.value === value)
    ? (value as CompanySize)
    : "51-200";
}

export async function listSearches(userId: string, limit?: number): Promise<Search[]> {
  const supabase = await createClient();

  let query = supabase
    .from("searches")
    .select("id, industry, location, company_size, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[leadflow] listSearches failed:", error.message);
    throw new Error("We could not load your searches right now. Please try again.");
  }

  const rows = (data ?? []) as SearchRow[];
  if (rows.length === 0) return [];

  // Result counts are derived rather than stored, so they cannot drift out of
  // sync with the companies actually saved.
  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .select("search_id")
    .eq("user_id", userId)
    .in(
      "search_id",
      rows.map((row) => row.id),
    );

  if (companyError) {
    console.error("[leadflow] listSearches counts failed:", companyError.message);
    throw new Error("We could not load your searches right now. Please try again.");
  }

  const counts = new Map<string, number>();
  for (const row of (companyRows ?? []) as { search_id: string }[]) {
    counts.set(row.search_id, (counts.get(row.search_id) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    criteria: {
      industry: row.industry,
      location: row.location,
      companySize: toCompanySize(row.company_size),
    },
    resultCount: counts.get(row.id) ?? 0,
    createdAt: row.created_at,
  }));
}
