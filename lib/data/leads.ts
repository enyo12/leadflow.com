import { labelForScore } from "@/lib/ai/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Company, EmailStatus, Lead, LeadAnalysis } from "@/types";

/**
 * Reads for the leads table.
 *
 * Every query filters on `user_id` explicitly *and* relies on RLS. The
 * explicit filter is defence in depth — if a policy were ever dropped, the
 * query still cannot return another user's rows. The `user_id` always comes
 * from the verified session, never from the caller's input.
 */

const LEAD_SELECT = `
  id,
  contact_name,
  email,
  email_status,
  fit_score,
  fit_label,
  ai_summary,
  ai_signals,
  recommended_action,
  confidence,
  unknowns,
  analyzed_at,
  created_at,
  company:companies (
    id,
    provider_id,
    name,
    domain,
    website,
    industry,
    location,
    employee_count,
    raw_data
  )
`;

interface CompanyRow {
  id: string;
  provider_id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  raw_data: Record<string, unknown> | null;
}

interface LeadRow {
  id: string;
  contact_name: string | null;
  email: string | null;
  email_status: string | null;
  fit_score: number | string | null;
  fit_label: string | null;
  ai_summary: string | null;
  ai_signals: unknown;
  recommended_action: string | null;
  confidence: number | string | null;
  unknowns: unknown;
  analyzed_at: string | null;
  created_at: string;
  company: CompanyRow | null;
}

const EMAIL_STATUSES: readonly string[] = ["verified", "unverified", "not_found"];

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toEmailStatus(value: unknown): EmailStatus {
  return typeof value === "string" && EMAIL_STATUSES.includes(value)
    ? (value as EmailStatus)
    : "not_found";
}

/** Null until Phase 4 writes AI output. Partial rows are treated as unanalyzed. */
function toAnalysis(row: LeadRow): LeadAnalysis | null {
  const fitScore = toNumber(row.fit_score);
  const confidence = toNumber(row.confidence);

  if (!row.analyzed_at || fitScore === null || row.ai_summary === null) {
    return null;
  }

  return {
    fitScore,
    // Rows analyzed before fit_label existed have no stored label; fall back to
    // the band for the score rather than rendering an empty badge.
    fitLabel: row.fit_label ?? labelForScore(fitScore),
    signals: toStringArray(row.ai_signals),
    summary: row.ai_summary,
    recommendedAction: row.recommended_action ?? "",
    confidence: confidence ?? 0,
    unknowns: toStringArray(row.unknowns),
  };
}

function toLead(row: LeadRow): Lead {
  const company = row.company;

  const mapped: Company = {
    id: company?.id ?? "",
    providerId: company?.provider_id ?? "",
    name: company?.name ?? "Unknown company",
    domain: company?.domain ?? null,
    website: company?.website ?? null,
    industry: company?.industry ?? null,
    location: company?.location ?? null,
    employeeCount: company?.employee_count ?? null,
    contactName: row.contact_name,
    contactEmail: row.email,
    emailStatus: toEmailStatus(row.email_status),
    rawData: company?.raw_data ?? {},
  };

  return {
    id: row.id,
    company: mapped,
    analysis: toAnalysis(row),
    status: row.analyzed_at ? "analyzed" : "new",
    analyzedAt: row.analyzed_at,
    createdAt: row.created_at,
  };
}

function fail(action: string, message: string): never {
  // The raw Postgres/PostgREST message is logged server-side only — it can
  // name tables and columns, so it is never handed to the UI.
  console.error(`[leadflow] ${action} failed:`, message);
  throw new Error("We could not load your leads right now. Please try again.");
}

export async function listLeads(userId: string, limit?: number): Promise<Lead[]> {
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (limit !== undefined) query = query.limit(limit);

  const { data, error } = await query;
  if (error) fail("listLeads", error.message);
  if (!data) return [];

  return (data as unknown as LeadRow[]).map(toLead);
}

/**
 * Fetches a specific set of leads, scoped to the signed-in user.
 *
 * Used by CSV export. The caller supplies only ids — never row data — and this
 * query is the authorization step: a lead belonging to another user simply does
 * not match `.eq("user_id", userId)` and is absent from the result, exactly as a
 * nonexistent id is. RLS enforces the same thing underneath.
 *
 * Returns fewer rows than ids when some no longer exist or are not the user's;
 * the caller is responsible for noticing and reporting that.
 */
export async function listLeadsByIds(
  userId: string,
  ids: readonly string[],
): Promise<Lead[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("user_id", userId)
    .in("id", ids as string[])
    // Same ordering as listLeads, so a CSV export is stable across runs.
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) fail("listLeadsByIds", error.message);
  if (!data) return [];

  return (data as unknown as LeadRow[]).map(toLead);
}

/** The detail route is keyed by company id, so the URL stays readable. */
export async function getLeadByCompanyId(
  userId: string,
  companyId: string,
): Promise<Lead | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) fail("getLeadByCompanyId", error.message);
  if (!data) return null;

  return toLead(data as unknown as LeadRow);
}
