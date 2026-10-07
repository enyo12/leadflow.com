import { Badge } from "@/components/ui/badge";
import { formatEmployeeCount, scoreTone } from "@/lib/format";
import type { LeadStatus } from "@/types";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Not analyzed",
  analyzed: "Analyzed",
  saved: "Saved",
};

const STATUS_VARIANTS: Record<LeadStatus, "secondary" | "info" | "success"> = {
  new: "secondary",
  analyzed: "info",
  saved: "success",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
  );
}

const TONE_VARIANTS = {
  high: "success",
  medium: "warning",
  low: "secondary",
} as const;

/** Fit score out of 100, or a muted placeholder when the lead is unscored. */
export function LeadScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Badge variant={TONE_VARIANTS[scoreTone(score)]} className="tabular-nums">
      {score}/100
    </Badge>
  );
}

/** Employee count with a consistent "unknown" treatment. */
export function EmployeeCount({ count }: { count: number | null }) {
  if (count === null) {
    return <span className="text-muted-foreground">Not available</span>;
  }
  return <span className="tabular-nums">{formatEmployeeCount(count)}</span>;
}
