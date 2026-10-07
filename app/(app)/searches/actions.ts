"use server";

import { revalidatePath } from "next/cache";

import { isAiConfigured } from "@/lib/ai/claude";
import { requireSessionUser } from "@/lib/auth";
import {
  PROVIDER_SUPPORTS_EMPLOYEE_COUNT,
  ProviderError,
  searchBusinesses,
} from "@/lib/providers/business-provider";
import type { ProviderSearchResult } from "@/lib/providers/types";
import type { SearchActionState } from "@/lib/search-form-state";
import { createClient } from "@/lib/supabase/server";
import {
  COMPANY_SIZES,
  type CompanySize,
  type Lead,
  type SearchCriteria,
} from "@/types";

/**
 * This module is `"use server"`, so it may export *only* async functions.
 * `SearchActionState` and `EMPTY_SEARCH_STATE` live in
 * `lib/search-form-state.ts` because the client needs them and importing a
 * value from here is a build error.
 */

const EMPTY_QUALITY = {
  duplicatesRemoved: 0,
  recordsRejected: 0,
  sizeFilterApplied: PROVIDER_SUPPORTS_EMPLOYEE_COUNT,
} as const;

const MAX_FIELD_LENGTH = 120;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function fail(error: string, criteria: SearchCriteria | null = null): SearchActionState {
  return {
    status: "error",
    error,
    leads: [],
    criteria,
    ...EMPTY_QUALITY,
    aiConfigured: isAiConfigured(),
  };
}

/**
 * Turns a provider failure into something a user can act on.
 *
 * The provider's own message is logged server-side and never returned: it can
 * contain the endpoint, the query, or upstream error text.
 */
function friendlyProviderError(error: unknown): string {
  if (error instanceof ProviderError) {
    switch (error.kind) {
      case "location_not_found":
        return "We could not find that location. Try a city, region, or country.";
      case "rate_limited":
        return "The business directory is busy right now. Please wait a moment and try again.";
      case "timeout":
        return "That search took too long. Try a smaller or more specific location.";
      case "bad_response":
      case "unavailable":
      case "no_provider":
        return "Unable to retrieve businesses right now. Please try again.";
    }
  }
  return "Unable to retrieve businesses right now. Please try again.";
}

/**
 * Runs a lead search against the real provider and persists everything it returns.
 *
 * The provider call happens here, on the server, so the credentials behind it
 * never reach the browser.
 *
 * The owning user is taken from the verified session (`requireSessionUser`),
 * never from the submitted form — a client that posts someone else's user id
 * simply gets its own row written, and RLS would reject the insert anyway.
 */
export async function runSearchAction(
  _previous: SearchActionState,
  formData: FormData,
): Promise<SearchActionState> {
  const industry = text(formData, "industry");
  const location = text(formData, "location");
  const rawSize = text(formData, "companySize");

  if (industry === "" || location === "") {
    return fail("Enter both an industry and a location to run a search.");
  }
  if (industry.length > MAX_FIELD_LENGTH || location.length > MAX_FIELD_LENGTH) {
    return fail(`Industry and location must be under ${MAX_FIELD_LENGTH} characters.`);
  }

  const companySize: CompanySize = COMPANY_SIZES.some(
    (option) => option.value === rawSize,
  )
    ? (rawSize as CompanySize)
    : "51-200";

  const criteria: SearchCriteria = { industry, location, companySize };

  const user = await requireSessionUser("/searches");
  const supabase = await createClient();

  // 1. Retrieve from the external provider.
  let outcome: ProviderSearchResult;
  try {
    outcome = await searchBusinesses(criteria);
  } catch (error) {
    console.error("[leadflow] provider search failed:", error);
    return fail(friendlyProviderError(error), criteria);
  }

  const companies = outcome.companies;

  if (outcome.recordsRejected > 0) {
    console.warn(
      `[leadflow] provider returned ${outcome.recordsRejected} record(s) with no usable name`,
    );
  }

  // 2. Save the search.
  const { data: search, error: searchError } = await supabase
    .from("searches")
    .insert({
      user_id: user.id,
      industry: criteria.industry,
      location: criteria.location,
      company_size: criteria.companySize,
    })
    .select("id, created_at")
    .single();

  if (searchError || !search) {
    console.error("[leadflow] save search failed:", searchError?.message ?? "no row");
    return fail("We could not save your search. Please try again.", criteria);
  }

  const quality = {
    duplicatesRemoved: outcome.duplicatesRemoved,
    recordsRejected: outcome.recordsRejected,
    sizeFilterApplied: PROVIDER_SUPPORTS_EMPLOYEE_COUNT,
    aiConfigured: isAiConfigured(),
  };

  if (companies.length === 0) {
    refreshViews();
    return { status: "success", error: null, criteria, leads: [], ...quality };
  }

  // 3. Save the companies. PostgREST has no multi-statement transaction, so a
  //    failure here is compensated by deleting the search row rather than
  //    leaving a search that claims results it does not have.
  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .insert(
      companies.map((company) => ({
        user_id: user.id,
        search_id: search.id,
        provider_id: company.providerId,
        name: company.name,
        domain: company.domain,
        website: company.website,
        industry: company.industry,
        location: company.location,
        // Always null for this provider — see PROVIDER_SUPPORTS_EMPLOYEE_COUNT.
        employee_count: company.employeeCount,
        raw_data: company.rawData,
      })),
    )
    .select("id, provider_id");

  if (companyError || !companyRows) {
    console.error("[leadflow] save companies failed:", companyError?.message ?? "no rows");
    await supabase.from("searches").delete().eq("id", search.id).eq("user_id", user.id);
    return fail("We could not save the results of your search. Please try again.", criteria);
  }

  const companyIdByProviderId = new Map<string, string>(
    (companyRows as { id: string; provider_id: string }[]).map((row) => [
      row.provider_id,
      row.id,
    ]),
  );

  // 4. One lead per company. The AI columns stay null until Phase 4.
  const leadPayload = companies.flatMap((company) => {
    const companyId = companyIdByProviderId.get(company.providerId);
    if (!companyId) return [];

    return [
      {
        user_id: user.id,
        company_id: companyId,
        contact_name: company.contactName,
        // Only ever an address the provider actually supplied — never guessed.
        email: company.contactEmail,
        email_status: company.emailStatus,
      },
    ];
  });

  const { data: leadRows, error: leadError } = await supabase
    .from("leads")
    .insert(leadPayload)
    .select("id, company_id, created_at");

  if (leadError || !leadRows) {
    console.error("[leadflow] save leads failed:", leadError?.message ?? "no rows");
    await supabase.from("searches").delete().eq("id", search.id).eq("user_id", user.id);
    return fail("We could not save the results of your search. Please try again.", criteria);
  }

  // 5. Build the response from what was actually written, so the UI shows
  //    persisted rows (with their real ids) rather than the provider payload.
  const leadIdByCompanyId = new Map<string, { id: string; created_at: string }>(
    (leadRows as { id: string; company_id: string; created_at: string }[]).map((row) => [
      row.company_id,
      { id: row.id, created_at: row.created_at },
    ]),
  );

  const leads: Lead[] = companies.flatMap((company) => {
    const companyId = companyIdByProviderId.get(company.providerId);
    const lead = companyId ? leadIdByCompanyId.get(companyId) : undefined;
    if (!lead) return [];

    return [
      {
        id: lead.id,
        company: { ...company, id: companyId as string },
        analysis: null,
        status: "new" as const,
        analyzedAt: null,
        createdAt: lead.created_at,
      },
    ];
  });

  refreshViews();

  return { status: "success", error: null, criteria, leads, ...quality };
}

function refreshViews() {
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/searches");
}
