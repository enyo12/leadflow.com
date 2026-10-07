/**
 * Display helpers for AI analysis output.
 *
 * Pure functions, no imports: used by both the server-rendered lead detail and
 * the client-rendered lead card, so neither has to depend on the other.
 */

/**
 * Prefix the system prompt requires on any signal the model reasoned to rather
 * than read directly off a supplied field.
 */
const INFERRED_PREFIX = "inferred:";

export interface SplitSignals {
  /** Statements traceable to a supplied field. */
  evidence: string[];
  /** Statements the model reasoned to. Rendered separately, never as fact. */
  inferred: string[];
}

/**
 * Splits signals into evidence and inference.
 *
 * The model marks inferences with an "Inferred:" prefix; the prompt tells it to,
 * but a model occasionally forgets. Those statements are treated as evidence,
 * which is the more conservative failure for a set labelled "from your data" —
 * the surrounding card is already badged as AI inference either way.
 */
export function splitSignals(signals: string[]): SplitSignals {
  const evidence: string[] = [];
  const inferred: string[] = [];

  for (const signal of signals) {
    if (signal.trim().toLowerCase().startsWith(INFERRED_PREFIX)) {
      inferred.push(signal.trim().slice(INFERRED_PREFIX.length).trim());
    } else {
      evidence.push(signal);
    }
  }

  return { evidence, inferred };
}

/** "Excellent Fit" → "excellent" for badge variants. */
export function fitLabelTone(label: string): "success" | "info" | "warning" | "secondary" {
  switch (label) {
    case "Excellent Fit":
      return "success";
    case "Good Fit":
      return "info";
    case "Possible Fit":
      return "warning";
    default:
      return "secondary";
  }
}

/** 0.92 → "92%" */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
