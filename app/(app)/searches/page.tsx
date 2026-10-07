"use client";

import { useActionState, useState } from "react";
import { Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ExportCsvButton } from "@/components/export-csv-button";
import { LeadList } from "@/components/lead-list";
import { PageHeader } from "@/components/page-header";
import { SearchForm, type SearchFormErrors } from "@/components/search-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { COMPANY_SIZES, type SearchCriteria } from "@/types";
import { EMPTY_SEARCH_STATE } from "@/lib/search-form-state";
import { runSearchAction } from "./actions";

const EMPTY_CRITERIA: SearchCriteria = {
  industry: "",
  location: "",
  companySize: "51-200",
};

function sizeLabel(size: SearchCriteria["companySize"]) {
  return COMPANY_SIZES.find((option) => option.value === size)?.label ?? size;
}

function validate(criteria: SearchCriteria): SearchFormErrors {
  const errors: SearchFormErrors = {};
  if (criteria.industry.trim() === "") {
    errors.industry = "Enter an industry to search.";
  }
  if (criteria.location.trim() === "") {
    errors.location = "Enter a location to search.";
  }
  return errors;
}

export default function SearchesPage() {
  const [criteria, setCriteria] = useState<SearchCriteria>(EMPTY_CRITERIA);
  const [errors, setErrors] = useState<SearchFormErrors>({});
  const [state, formAction, isPending] = useActionState(
    runSearchAction,
    EMPTY_SEARCH_STATE,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /**
   * Client-side guard only. The Server Action validates the same fields again —
   * this just avoids a round trip for an obviously empty form.
   */
  function guardSubmit() {
    const nextErrors = validate(criteria);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return false;

    // A new search replaces the results, so any previous selection is stale.
    setSelectedIds(new Set());
    return true;
  }

  function toggleSelect(leadId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!leads) return;
    setSelectedIds((previous) =>
      previous.size === leads.length
        ? new Set()
        : new Set(leads.map((lead) => lead.id)),
    );
  }

  const leads = state.status === "success" ? state.leads : null;
  const ranCriteria = state.criteria;

  // Only ids still present in the results. A selection can outlive the row it
  // points at when a new search replaces the list.
  const selectedLeadIds = leads
    ? leads.filter((lead) => selectedIds.has(lead.id)).map((lead) => lead.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead search"
        description="Describe the companies you want to reach. LeadFlow retrieves matching businesses and stores them in your workspace."
      />

      <SearchForm
        value={criteria}
        onChange={setCriteria}
        action={formAction}
        onSubmit={guardSubmit}
        loading={isPending}
        errors={errors}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Results</h2>
          {ranCriteria && !isPending && leads ? (
            <p className="min-w-0 text-sm text-muted-foreground">
              {leads.length} {leads.length === 1 ? "company" : "companies"}{" "}
              · {ranCriteria.industry} · {ranCriteria.location} ·{" "}
              {sizeLabel(ranCriteria.companySize)} employees
            </p>
          ) : null}
        </div>

        {isPending ? (
          <ResultsSkeleton />
        ) : state.status === "error" ? (
          <EmptyState
            tone="error"
            title="Search failed"
            description={state.error ?? "Something went wrong."}
          />
        ) : leads === null ? (
          <EmptyState
            icon={Search}
            title="No search yet"
            description="Choose an industry, a location, and a company size, then run a search to see matching companies here."
          />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No companies matched"
            description={`Nothing matched ${ranCriteria?.industry} in ${ranCriteria?.location} with ${sizeLabel(
              ranCriteria?.companySize ?? "51-200",
            )} employees. Try a broader industry or location.`}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Saved to your workspace. These companies now appear on the Leads
              page and stay there after a refresh.
            </p>

            {!state.sizeFilterApplied ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Company size was not applied.
                </span>{" "}
                The directory this search reads from does not publish employee
                counts, so these results are not filtered by size and each
                company shows &ldquo;Not available&rdquo;. Your size selection
                is still recorded on the search.
              </p>
            ) : null}

            {state.duplicatesRemoved > 0 ? (
              <p className="text-xs text-muted-foreground">
                {state.duplicatesRemoved} duplicate{" "}
                {state.duplicatesRemoved === 1 ? "business" : "businesses"}{" "}
                collapsed before saving.
              </p>
            ) : null}

            {selectedLeadIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-accent px-4 py-2.5">
                <p className="min-w-0 text-sm font-medium">
                  {selectedLeadIds.length} selected
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear selection
                  </Button>
                  <ExportCsvButton
                    leadIds={selectedLeadIds}
                    size="sm"
                    variant="outline"
                  />
                </div>
              </div>
            ) : null}

            <LeadList
              leads={leads}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              criteria={ranCriteria ?? undefined}
              aiConfigured={state.aiConfigured}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <Card aria-busy="true" aria-live="polite">
      <CardContent className="space-y-4">
        <span className="sr-only">Searching for companies…</span>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-32 sm:block" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
