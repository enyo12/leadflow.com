import type { LeadAnalysis } from "@/types";

/**
 * Shared state for the analyze form.
 *
 * This lives outside app/(app)/leads/actions.ts on purpose. A Client Component
 * that imports a non-action value from a "use server" module pulls the whole
 * module — including `server-only` and the Anthropic SDK — into the browser
 * bundle and fails the build. Types and constants used by both sides belong
 * here; only the action functions live in the "use server" file.
 */

export interface AnalyzeActionState {
  status: "idle" | "success" | "error" | "unavailable";
  error: string | null;
  /** Present on success, though the UI re-renders from the database instead. */
  analysis: LeadAnalysis | null;
  analyzedAt: string | null;
}

export const EMPTY_ANALYZE_STATE: AnalyzeActionState = {
  status: "idle",
  error: null,
  analysis: null,
  analyzedAt: null,
};

/** Shown when ANTHROPIC_API_KEY is absent, in the UI and from the action. */
export const AI_NOT_CONFIGURED_MESSAGE =
  "AI analysis is not configured. Add ANTHROPIC_API_KEY to your environment and restart the app.";
