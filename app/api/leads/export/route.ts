import { getSessionUser } from "@/lib/auth";
import { UTF8_BOM } from "@/lib/csv";
import { listLeadsByIds } from "@/lib/data/leads";
import { buildLeadsCsv } from "@/lib/export/leads";
import { MAX_EXPORT_LEADS } from "@/lib/export/limits";

/**
 * POST /api/leads/export
 *
 * Body:   { leadIds: string[] }
 * Returns: text/csv as a file download.
 *
 * A route handler rather than a Server Action because a download needs its own
 * Content-Type and Content-Disposition, which an action's return value cannot
 * set. POST rather than GET because "select all" can exceed the practical URL
 * length limit a query string would impose.
 *
 * SECURITY — the request body is treated as hostile:
 *
 *   * The caller sends only ids. No row data crosses from the browser, so a
 *     client cannot fabricate a company or an AI summary into the file.
 *   * The session supplies `user_id`. It is never read from the body.
 *   * Ids are re-fetched from the database, filtered by that user id, so an id
 *     belonging to someone else returns no row — the same outcome as an id that
 *     does not exist.
 *   * RLS on `leads` enforces the same boundary underneath.
 *
 * This handler performs no AI call and no provider call. Exporting never
 * triggers analysis; it only reads rows that already exist.
 */

/** Postgres uuid form. Anything else is rejected before it reaches a query. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** `leadflow-leads-2026-09-28.csv`, in UTC so the name is server-determined. */
function exportFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `leadflow-leads-${stamp}.csv`;
}

export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate. Absent session means no export, full stop.
  const user = await getSessionUser();
  if (!user) {
    return jsonError("You need to be signed in to export leads.", 401);
  }

  // 2. Parse the body defensively — it is client-supplied.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("That export request could not be read.", 400);
  }

  const requested = (body as { leadIds?: unknown } | null)?.leadIds;

  if (!Array.isArray(requested) || requested.length === 0) {
    return jsonError("Select at least one lead to export.", 400);
  }

  // Rejected rather than truncated, so a malformed request cannot silently
  // produce a partial file.
  if (requested.length > MAX_EXPORT_LEADS) {
    return jsonError(
      `You can export up to ${MAX_EXPORT_LEADS} leads at a time. Select fewer and try again.`,
      400,
    );
  }

  if (!requested.every((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))) {
    return jsonError("That export request contained an invalid lead.", 400);
  }

  // De-duplicate: the same id twice would otherwise produce a duplicate row.
  const ids = [...new Set(requested)];

  // 3. Authorized fetch. Anything not owned by this user is simply absent.
  let leads;
  try {
    leads = await listLeadsByIds(user.id, ids);
  } catch (error) {
    // listLeadsByIds already logs the underlying database message server-side.
    console.error("[leadflow] export: lead fetch failed:", error);
    return jsonError("Unable to export the selected leads. Please try again.", 500);
  }

  if (leads.length === 0) {
    return jsonError(
      "None of the selected leads could be found. They may have been removed.",
      404,
    );
  }

  // 4. Generate. Reading rows only — no AI call, no provider call.
  const csv = `${UTF8_BOM}${buildLeadsCsv(leads)}`;

  // Counts let the UI tell the user when a selection was partly stale, rather
  // than quietly handing back a shorter file.
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${exportFilename()}"`,
    "Cache-Control": "no-store",
    "X-LeadFlow-Requested": String(ids.length),
    "X-LeadFlow-Exported": String(leads.length),
  });

  return new Response(csv, { status: 200, headers });
}
