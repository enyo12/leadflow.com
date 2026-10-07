/**
 * Shared domain types for LeadFlow.
 *
 * Field names mirror the Supabase schema (see supabase/migrations) so that
 * swapping mock data for real rows in Phase 2+ is a like-for-like replacement.
 */

export const COMPANY_SIZES = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-500", label: "201–500" },
  { value: "500+", label: "500+" },
] as const;

export type CompanySize = (typeof COMPANY_SIZES)[number]["value"];

export interface SearchCriteria {
  industry: string;
  location: string;
  companySize: CompanySize;
}

export interface Search {
  id: string;
  criteria: SearchCriteria;
  resultCount: number;
  createdAt: string;
}

/** Whether the email address was validated by the data provider. */
export type EmailStatus = "verified" | "unverified" | "not_found";

export interface Company {
  id: string;
  /** Identifier assigned by the external data provider. */
  providerId: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  /**
   * Employee count as an integer. Providers that only publish a range
   * (e.g. "51-200") are normalized to the lower bound of that range; the
   * original value is preserved in `rawData`.
   */
  employeeCount: number | null;
  contactName: string | null;
  contactEmail: string | null;
  emailStatus: EmailStatus;
  /** Untouched provider payload, kept for debugging and future re-normalization. */
  rawData: Record<string, unknown>;
}

/**
 * Structured output returned by Claude for a single company.
 * Kept in sync with the Zod schema in lib/ai/schemas.ts.
 */
export interface LeadAnalysis {
  /** 0–100 */
  fitScore: number;
  /** Human-readable band for fitScore. */
  fitLabel: string;
  signals: string[];
  summary: string;
  recommendedAction: string;
  /** 0–1 */
  confidence: number;
  /** Facts the provided data could not establish. */
  unknowns: string[];
}

export type LeadStatus = "new" | "analyzed" | "saved";

export interface Lead {
  id: string;
  company: Company;
  analysis: LeadAnalysis | null;
  status: LeadStatus;
  analyzedAt: string | null;
  createdAt: string;
}

/** Aggregate counts shown on the dashboard. Computed from the user's own rows. */
export interface DashboardStats {
  totalSearches: number;
  totalLeads: number;
  analyzedLeads: number;
  /** Mean fit score across analyzed leads, or null when none are analyzed. */
  averageScore: number | null;
}
