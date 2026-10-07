"use client";

import { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";

import { ExportCsvButton } from "@/components/export-csv-button";
import { LeadList } from "@/components/lead-list";
import { Button } from "@/components/ui/button";
import { MAX_EXPORT_LEADS } from "@/lib/export/limits";
import type { Lead, SearchCriteria } from "@/types";

/**
 * Owns lead selection for a page, and the export that acts on it.
 *
 * This exists as a Client Component because selection is interaction state, but
 * it deliberately holds *only ids*. The leads themselves are rendered from the
 * server's props and are never sent back — see the export route for why that
 * matters.
 */

interface LeadsWorkspaceProps {
  leads: Lead[];
  aiConfigured: boolean;
  /** Passed through to each card's detail link when a search context exists. */
  criteria?: SearchCriteria;
}

export function LeadsWorkspace({
  leads,
  aiConfigured,
  criteria,
}: LeadsWorkspaceProps) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const listedIds = useMemo(() => leads.map((lead) => lead.id), [leads]);

  const toggleSelect = useCallback((leadId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      // A Set rather than an array: toggling twice must not leave the id in the
      // selection, and selecting twice must not produce two CSV rows.
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((current) =>
      current.size === listedIds.length ? new Set() : new Set(listedIds),
    );
  }, [listedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /**
   * Intersected with what is currently listed, in list order.
   *
   * A selected id can outlive its row — the selection survives a re-render
   * after an analysis, and a lead could disappear between pages. Exporting the
   * intersection means the file matches what the user can still see, and the
   * route's requested/exported counts stay meaningful.
   */
  const selectedLeadIds = useMemo(
    () => listedIds.filter((id) => selectedIds.has(id)),
    [listedIds, selectedIds],
  );

  const selectedCount = selectedLeadIds.length;
  const overLimit = selectedCount > MAX_EXPORT_LEADS;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
        <span className="text-sm font-medium" aria-live="polite">
          {selectedCount === 0 ? "No leads selected" : `Selected: ${selectedCount}`}
        </span>

        {selectedCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            <X className="size-3.5" aria-hidden="true" />
            Clear selection
          </Button>
        ) : null}

        <div className="ml-auto">
          <ExportCsvButton leadIds={selectedLeadIds} size="sm" />
        </div>
      </div>

      {/* The cap is enforced by the route. Saying so here means the user learns
          it while selecting rather than after a failed export. */}
      {overLimit ? (
        <p className="text-xs text-destructive">
          You can export up to {MAX_EXPORT_LEADS} leads at a time. Select fewer and
          export in batches — nothing is trimmed from the file to fit.
        </p>
      ) : null}

      <LeadList
        leads={leads}
        aiConfigured={aiConfigured}
        criteria={criteria}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
      />
    </div>
  );
}
