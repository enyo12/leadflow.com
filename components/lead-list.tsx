"use client";

import { useEffect, useRef } from "react";

import { LeadCard } from "@/components/lead-card";
import { Checkbox } from "@/components/ui/checkbox";
import type { Lead, SearchCriteria } from "@/types";

interface LeadListProps {
  leads: Lead[];
  /** "compact" drops the analysis block — used by the dashboard preview. */
  variant?: "full" | "compact";
  /**
   * Selection controls are only rendered when all three are provided.
   *
   * Read-only, because a list only reads it — which also lets a caller that
   * keeps selection in state as a ReadonlySet pass it straight through.
   */
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (leadId: string) => void;
  onToggleSelectAll?: () => void;
  /** Carried into the detail link so the analysis can use the search context. */
  criteria?: SearchCriteria;
  /** False when ANTHROPIC_API_KEY is absent; passed through to each card. */
  aiConfigured: boolean;
}

/** Native checkbox needs the indeterminate flag set imperatively. */
function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <Checkbox
      ref={ref}
      checked={checked}
      onChange={onChange}
      aria-label="Select all leads"
    />
  );
}

export function LeadList({
  leads,
  variant = "full",
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  criteria,
  aiConfigured,
}: LeadListProps) {
  const selectable = Boolean(
    selectedIds && onToggleSelect && onToggleSelectAll,
  );
  const selectedCount = selectedIds?.size ?? 0;
  const allSelected = selectable && selectedCount === leads.length;

  return (
    <div className="min-w-0 space-y-3">
      {selectable ? (
        <div className="flex items-center gap-2 px-1">
          <SelectAllCheckbox
            checked={allSelected}
            indeterminate={selectedCount > 0 && !allSelected}
            onChange={onToggleSelectAll!}
          />
          <span className="text-sm text-muted-foreground">Select all</span>
        </div>
      ) : null}

      <ul className="min-w-0 space-y-3">
        {leads.map((lead) => (
          <li key={lead.id} className="min-w-0">
            <LeadCard
              lead={lead}
              variant={variant}
              selectable={selectable}
              selected={selectedIds?.has(lead.id) ?? false}
              onToggleSelect={onToggleSelect}
              criteria={criteria}
              aiConfigured={aiConfigured}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
