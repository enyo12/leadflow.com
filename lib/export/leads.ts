import { toCsv } from "@/lib/csv";
import type { Lead } from "@/types";

/**
 * Database Lead → Export Lead → CSV row.
 *
 * The transformation is explicit and lives here rather than in the route, so
 * the column order and the meaning of every cell can be read in one place. A
 * database row never reaches the CSV writer directly: that is what keeps
 * `user_id`, internal ids and `raw_data` out of the file by construction rather
 * than by remembering to delete them.
 *
 * What is deliberately NOT exported:
 *   - `user_id` and any other internal identifier
 *   - `raw_data` (the provider payload — verbose and not user-facing)
 *   - any credential or provider/API detail
 *
 * The company's own `id` is also omitted: it is a database primary key, and the
 * CSV is a list of companies rather than a set of row references.
 */

/** Sentinel used in place of a value the record does not have. */
const EMPTY = "";

/** Excel-safe separator for list values. */
const LIST_SEPARATOR = "; ";

export interface LeadExportColumn {
  header: string;
  value: (lead: Lead) => string;
}

/**
 * Column order is fixed and documented, because a spreadsheet's column layout
 * is effectively an interface once someone builds a formula on top of it.
 */
export const LEAD_EXPORT_COLUMNS: readonly LeadExportColumn[] = [
  { header: "Company Name", value: (lead) => lead.company.name },
  { header: "Industry", value: (lead) => lead.company.industry ?? EMPTY },
  { header: "Location", value: (lead) => lead.company.location ?? EMPTY },
  {
    header: "Company Size",
    value: (lead) =>
      lead.company.employeeCount === null
        ? EMPTY
        : String(lead.company.employeeCount),
  },
  { header: "Website", value: (lead) => lead.company.website ?? EMPTY },
  { header: "Domain", value: (lead) => lead.company.domain ?? EMPTY },
  { header: "Contact Name", value: (lead) => lead.company.contactName ?? EMPTY },
  { header: "Email", value: (lead) => lead.company.contactEmail ?? EMPTY },
  {
    header: "Email Status",
    // "not_found" is the absence sentinel; the Email column is blank for those
    // rows too, so a blank here reads consistently rather than as a missing value.
    value: (lead) =>
      lead.company.emailStatus === "not_found" ? EMPTY : lead.company.emailStatus,
  },

  // --- AI analysis. Blank throughout when the lead has not been analyzed;
  //     the Lead Status column says so explicitly. Never triggers a call.
  { header: "Fit Score", value: (lead) => (lead.analysis ? String(lead.analysis.fitScore) : EMPTY) },
  { header: "Fit Label", value: (lead) => lead.analysis?.fitLabel ?? EMPTY },
  { header: "AI Summary", value: (lead) => lead.analysis?.summary ?? EMPTY },
  {
    header: "AI Signals",
    value: (lead) => lead.analysis?.signals.join(LIST_SEPARATOR) ?? EMPTY,
  },
  {
    header: "Recommended Action",
    value: (lead) => lead.analysis?.recommendedAction ?? EMPTY,
  },
  {
    header: "Confidence",
    value: (lead) => (lead.analysis ? String(lead.analysis.confidence) : EMPTY),
  },
  {
    header: "Unknowns",
    value: (lead) => lead.analysis?.unknowns.join(LIST_SEPARATOR) ?? EMPTY,
  },
  {
    // ISO 8601 in UTC. Sorts correctly as text, carries no comma, and is
    // unambiguous about timezone — unlike a locale-formatted date.
    header: "Analysis Date",
    value: (lead) => lead.analyzedAt ?? EMPTY,
  },

  {
    header: "Lead Status",
    value: (lead) => (lead.analysis ? "Analyzed" : "Not analyzed"),
  },
];

export const LEAD_EXPORT_HEADERS: readonly string[] = LEAD_EXPORT_COLUMNS.map(
  (column) => column.header,
);

/** One lead → one row, in the fixed column order. */
export function leadToRow(lead: Lead): string[] {
  return LEAD_EXPORT_COLUMNS.map((column) => column.value(lead));
}

/** The complete file contents, without the byte-order mark. */
export function buildLeadsCsv(leads: readonly Lead[]): string {
  return toCsv(LEAD_EXPORT_HEADERS, leads.map(leadToRow));
}
