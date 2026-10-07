import { z } from "zod";

/**
 * The contract between LeadFlow and the model.
 *
 * This file is the single source of truth for the analysis shape. The system
 * prompt is built from it (see lead-analysis.ts) and every response is parsed
 * through it before anything is written to the database — so the model's output
 * is never trusted, only validated.
 */

/** The four labels the database check constraint also allows. */
export const FIT_LABELS = [
  "Excellent Fit",
  "Good Fit",
  "Possible Fit",
  "Poor Fit",
] as const;

export type FitLabel = (typeof FIT_LABELS)[number];

/**
 * Bounds applied before validation, so an oversized response cannot be stored.
 * The prompt asks for brevity; these are the enforcement.
 */
export const ANALYSIS_LIMITS = {
  maxSignals: 8,
  maxUnknowns: 10,
  maxSummaryChars: 600,
  maxActionChars: 400,
  maxSignalChars: 200,
} as const;

/**
 * A single evidence string. Trimmed, and rejected outright if empty — a blank
 * bullet is worse than no bullet, and the model sometimes emits one.
 */
const evidence = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .max(ANALYSIS_LIMITS.maxSignalChars);

export const leadAnalysisSchema = z.object({
  fit_score: z
    .number()
    .int("fit_score must be a whole number")
    .min(0)
    .max(100),

  fit_label: z.enum(FIT_LABELS),

  signals: z
    .array(evidence)
    .max(ANALYSIS_LIMITS.maxSignals)
    // A model that returns duplicate bullets is padding; collapse them.
    .transform((items) => [...new Set(items)]),

  summary: z.string().trim().min(1).max(ANALYSIS_LIMITS.maxSummaryChars),

  recommended_action: z
    .string()
    .trim()
    .min(1)
    .max(ANALYSIS_LIMITS.maxActionChars),

  /**
   * The API is asked for 0-1. Models sometimes answer as a percentage instead,
   * so [2, 100] is accepted and rescaled.
   *
   * The branches are deliberately non-overlapping. A plain 0-1 / 0-100 union
   * would let anything in (1, 100] fall through to the percentage branch, so a
   * malformed `1.5` would be silently stored as 0.015 rather than rejected.
   * Excluding (1, 2) removes the only band where the two scales are genuinely
   * ambiguous — a real percentage answer is never 1.5% and a real fraction is
   * never 1.5.
   */
  confidence: z.union([
    z.number().min(0).max(1),
    z
      .number()
      .min(2)
      .max(100)
      .transform((value) => value / 100),
  ]),

  unknowns: z
    .array(evidence)
    .max(ANALYSIS_LIMITS.maxUnknowns)
    .transform((items) => [...new Set(items)]),
});

export type LeadAnalysisOutput = z.infer<typeof leadAnalysisSchema>;

/**
 * JSON Schema handed to the API for structured output.
 *
 * Written by hand rather than generated from Zod: the API accepts a narrower
 * subset than Zod can express, and a generated schema that the API silently
 * ignores is worse than an explicit one. The Zod schema above remains the
 * validator — this only steers the model.
 */
export const LEAD_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    fit_score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description:
        "How well this company matches the user's search criteria, based only on the supplied evidence.",
    },
    fit_label: {
      type: "string",
      enum: [...FIT_LABELS],
      description:
        "Must correspond to fit_score: 80-100 Excellent Fit, 60-79 Good Fit, 40-59 Possible Fit, 0-39 Poor Fit.",
    },
    signals: {
      type: "array",
      maxItems: ANALYSIS_LIMITS.maxSignals,
      items: { type: "string" },
      description:
        "Short evidence-based statements. Each must be traceable to a supplied field.",
    },
    summary: {
      type: "string",
      maxLength: ANALYSIS_LIMITS.maxSummaryChars,
      description:
        "Two or three sentences on why the company does or does not fit.",
    },
    recommended_action: {
      type: "string",
      maxLength: ANALYSIS_LIMITS.maxActionChars,
      description:
        "A practical next step the user can take with the information available.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "How much of this assessment is supported by supplied data. Lower it when key fields are missing.",
    },
    unknowns: {
      type: "array",
      maxItems: ANALYSIS_LIMITS.maxUnknowns,
      items: { type: "string" },
      description:
        "Information that could not be established from the supplied data.",
    },
  },
  required: [
    "fit_score",
    "fit_label",
    "signals",
    "summary",
    "recommended_action",
    "confidence",
    "unknowns",
  ],
  additionalProperties: false,
} as const;

/**
 * The label implied by a score. Used to keep the stored pair self-consistent —
 * the model is told to agree with these bands, and a response that contradicts
 * them is corrected rather than stored as-is.
 */
export function labelForScore(score: number): FitLabel {
  if (score >= 80) return "Excellent Fit";
  if (score >= 60) return "Good Fit";
  if (score >= 40) return "Possible Fit";
  return "Poor Fit";
}
