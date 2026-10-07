/**
 * Small shared display helpers.
 *
 * Dates are pinned to UTC and en-US. Without an explicit timezone the server
 * (UTC on Vercel) and the browser (local) would format the same timestamp
 * differently, which React reports as a hydration mismatch.
 */

const DATE_TIME_ZONE = "UTC";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: DATE_TIME_ZONE,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DATE_TIME_ZONE,
  });
}

export function formatEmployeeCount(count: number | null): string {
  return count === null ? "Not available" : count.toLocaleString("en-US");
}

/** Maps a 0–100 fit score onto the semantic tone used by the score badge. */
export function scoreTone(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
