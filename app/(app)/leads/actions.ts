"use server";

import { revalidatePath } from "next/cache";

import { AiError, isAiConfigured } from "@/lib/ai/claude";
import {
  AnalysisValidationError,
  analyzeCompany,
  type CompanyForAnalysis,
} from "@/lib/ai/lead-analysis";
import { labelForScore } from "@/lib/ai/schemas";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  type AnalyzeActionState,
} from "@/lib/analyze-form";
import { requireSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LeadAnalysis } from "@/types";

/**
 * The single server-side endpoint for AI analysis.
 *
 * Conceptually `POST /api/leads/analyze` with `{ company_id }`. It is a Server
 * Action rather than a route handler because every other write in this app is
 * one, and the form/`useActionState` plumbing already exists.
 *
 * The authority for "who is asking" is always the verified session. The form
 * submits only a company id, and that id is looked up *within* the session's own
 * rows — so a foreign id resolves to nothing and is indistinguishable from a
 * nonexistent one.
 */

/** Postgres/PostgREST uuid form, checked before the value is used in a query. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string): AnalyzeActionState {
  return { status: "error", error, analysis: null, analyzedAt: null };
}

/**
 * Turns an AI failure into something a user can act on.
 *
 * Neither upstream message nor stack trace is returned: AiError messages are
 * already sanitised, but the mapping is explicit so a future error path cannot
 * leak by default.
 */
function friendlyAiError(error: unknown): string {
  if (error instanceof AiError) {
    switch (error.kind) {
      case "missing_key":
        return AI_NOT_CONFIGURED_MESSAGE;
      case "auth_failed":
        return "AI analysis is not configured correctly. Check that ANTHROPIC_API_KEY is valid.";
      case "rate_limited":
        return "The AI service is busy right now. Please wait a moment and try again.";
      case "overloaded":
        return "The AI service is temporarily unavailable. Please try again shortly.";
      case "timeout":
        return "The analysis took too long. Please try again.";
      case "refused":
      case "bad_response":
        return "The AI could not analyze this company. Please try again.";
    }
  }

  if (error instanceof AnalysisValidationError) {
    return "The AI returned a response we could not use. Please try again.";
  }

  return "We could not analyze this lead right now. Please try again.";
}

export async function analyzeLeadAction(
  _previous: AnalyzeActionState,
  formData: FormData,
): Promise<AnalyzeActionState> {
  const rawCompanyId = formData.get("companyId");
  const companyId = typeof rawCompanyId === "string" ? rawCompanyId.trim() : "";

  // Re-analysis is never implied. It runs only when the form explicitly says
  // so, which only the "Re-analyze" button does.
  const force = formData.get("mode") === "reanalyze";

  if (!UUID_PATTERN.test(companyId)) {
    return fail("That lead could not be found.");
  }

  // Fail before touching the database or the API. The UI hides the action when
  // the key is absent, so this is the backstop for a direct invocation.
  if (!isAiConfigured()) {
    return {
      status: "unavailable",
      error: AI_NOT_CONFIGURED_MESSAGE,
      analysis: null,
      analyzedAt: null,
    };
  }

  const user = await requireSessionUser("/leads");
  const supabase = await createClient();

  // 1. Load the company *and* its lead. Both are filtered by user_id, so this
  //    is simultaneously the lookup and the ownership check. RLS backs it up.
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, name, domain, website, industry, location, employee_count, raw_data, search:searches (industry, location, company_size)",
    )
    .eq("id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (companyError) {
    console.error("[leadflow] analyze: company lookup failed:", companyError.message);
    return fail("We could not load this lead right now. Please try again.");
  }
  if (!company) {
    // Covers both "does not exist" and "belongs to someone else" — the caller
    // learns nothing about which.
    return fail("That lead could not be found.");
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, analyzed_at")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (leadError) {
    console.error("[leadflow] analyze: lead lookup failed:", leadError.message);
    return fail("We could not load this lead right now. Please try again.");
  }
  if (!lead) {
    return fail("That lead could not be found.");
  }

  // 2. Cost control: one analysis per lead by default. A second click returns
  //    the stored analysis instead of spending another API call. The UI hides
  //    the button once a lead is analyzed, so reaching this needs a direct
  //    invocation or two concurrent requests.
  if (lead.analyzed_at && !force) {
    const stored = await loadStoredAnalysis(companyId, user.id);
    if (stored) {
      return {
        status: "success",
        error: null,
        analysis: stored.analysis,
        analyzedAt: stored.analyzedAt,
      };
    }
  }

  // 3. Build the input from the company's own search, so the criteria the
  //    analysis is judged against are the ones actually used to find it.
  //    PostgREST types an embedded to-one relation as an array; accept both
  //    shapes rather than assuming, since the generated types defer to `any`.
  const searchRelation = company.search as
    | { industry: string; location: string; company_size: string }
    | { industry: string; location: string; company_size: string }[]
    | null;

  const search = Array.isArray(searchRelation)
    ? (searchRelation[0] ?? null)
    : searchRelation;

  const forAnalysis: CompanyForAnalysis = {
    name: company.name,
    domain: company.domain,
    website: company.website,
    industry: company.industry,
    location: company.location,
    employeeCount: company.employee_count,
    rawData: (company.raw_data ?? {}) as Record<string, unknown>,
  };

  // 4. One call, validated before it is trusted.
  let outcome;
  try {
    outcome = await analyzeCompany({
      criteria: {
        industry: search?.industry ?? company.industry ?? "Not specified",
        location: search?.location ?? company.location ?? "Not specified",
        companySize: search?.company_size ?? "Not specified",
      },
      company: forAnalysis,
    });
  } catch (error) {
    console.error("[leadflow] AI analysis failed:", error);
    return fail(friendlyAiError(error));
  }

  const { analysis } = outcome;
  const analyzedAt = new Date().toISOString();

  // 5. Persist. contact_name / email / email_status are deliberately absent:
  //    this phase never invents contact information, and the provider supplied
  //    none, so those columns keep whatever the search wrote.
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      fit_score: analysis.fit_score,
      fit_label: analysis.fit_label,
      ai_summary: analysis.summary,
      ai_signals: analysis.signals,
      recommended_action: analysis.recommended_action,
      confidence: analysis.confidence,
      unknowns: analysis.unknowns,
      analyzed_at: analyzedAt,
    })
    .eq("id", lead.id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[leadflow] analyze: save failed:", updateError.message);
    return fail("The analysis completed but could not be saved. Please try again.");
  }

  revalidatePaths();

  return {
    status: "success",
    error: null,
    analysis: {
      fitScore: analysis.fit_score,
      fitLabel: analysis.fit_label,
      signals: analysis.signals,
      summary: analysis.summary,
      recommendedAction: analysis.recommended_action,
      confidence: analysis.confidence,
      unknowns: analysis.unknowns,
    },
    analyzedAt,
  };
}

/** Reads an existing analysis back, for the no-extra-call path. */
async function loadStoredAnalysis(companyId: string, userId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select(
      "fit_score, fit_label, ai_summary, ai_signals, recommended_action, confidence, unknowns, analyzed_at",
    )
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || !data.analyzed_at || data.fit_score === null) return null;

  const signals = Array.isArray(data.ai_signals)
    ? data.ai_signals.filter((item): item is string => typeof item === "string")
    : [];
  const unknowns = Array.isArray(data.unknowns)
    ? data.unknowns.filter((item): item is string => typeof item === "string")
    : [];

  const fitScore = Number(data.fit_score);

  return {
    analysis: {
      fitScore,
      fitLabel: data.fit_label ?? labelForScore(fitScore),
      signals,
      summary: data.ai_summary ?? "",
      recommendedAction: data.recommended_action ?? "",
      confidence: data.confidence === null ? 0 : Number(data.confidence),
      unknowns,
    } satisfies LeadAnalysis,
    analyzedAt: data.analyzed_at as string,
  };
}

function revalidatePaths() {
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
