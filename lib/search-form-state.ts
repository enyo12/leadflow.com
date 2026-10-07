import type { Lead, SearchCriteria } from "@/types";

/**
 * Shared state for the search form and its results.
 *
 * This lives outside `app/(app)/searches/actions.ts` on purpose — the same
 * reason `lib/analyze-form.ts` exists. `actions.ts` carries `"use server"`, and
 * a Client Component importing a *non-action value* from such a module is a
 * hard error:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * `EMPTY_SEARCH_STATE` is the initial value `useActionState` needs, so it has
 * to be reachable from the browser. Only the action functions belong in the
 * `"use server"` file; types and constants shared by both sides belong here.
 */

export interface SearchActionState {
  status: "idle" | "success" | "error";
  error: string | null;
  /** Echoed back so the results header can describe the search that produced them. */
  criteria: SearchCriteria | null;
  leads: Lead[];
  /** How many duplicates the provider returned that were collapsed. */
  duplicatesRemoved: number;
  /** Provider records dropped because they had no usable company name. */
  recordsRejected: number;
  /** False when the provider cannot supply employee counts. */
  sizeFilterApplied: boolean;
  /**
   * Whether ANTHROPIC_API_KEY is present. Returned from the server so the
   * client component that renders the results does not need to reach for a
   * server-only module to find out.
   */
  aiConfigured: boolean;
}

export const EMPTY_SEARCH_STATE: SearchActionState = {
  status: "idle",
  error: null,
  criteria: null,
  leads: [],
  duplicatesRemoved: 0,
  recordsRejected: 0,
  /**
   * Hardcoded rather than imported from `PROVIDER_SUPPORTS_EMPLOYEE_COUNT`:
   * this module must stay client-safe, and the provider boundary pulls its
   * whole fetch layer in with it.
   *
   * That is safe because this value is never read. While the state is idle the
   * results block does not render at all, and every state that does render
   * results is built server-side in `actions.ts` from the real constant. False
   * is also the conservative direction — if it were ever read here it would
   * disclose that size was not applied rather than claim a filter that never
   * ran.
   */
  sizeFilterApplied: false,
  // No results are rendered while idle, so the real value is never needed here.
  aiConfigured: false,
};
