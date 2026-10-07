/**
 * Shared redirect-target validation.
 *
 * `?next=` values arrive from the browser, so they are treated as untrusted on
 * both the page and the Server Action that consumes them. Only same-site
 * relative paths are allowed; protocol-relative URLs ("//evil.com") and
 * absolute URLs are rejected.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}
