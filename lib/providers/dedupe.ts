/**
 * Removes duplicate companies from a result set.
 *
 * Two signals, in priority order:
 *   1. The provider's stable record id (for OpenStreetMap, `node/12345`).
 *   2. A composite of domain + name + location, so records with no id — or the
 *      same business mapped twice — still collapse.
 *
 * Intentionally not fuzzy: exact-normalized comparison only. Fuzzy matching
 * belongs in a later phase, if it is ever needed at all.
 */

import type { Company } from "@/types";

function normalizePart(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function compositeKey(company: Company): string {
  return [
    normalizePart(company.domain),
    normalizePart(company.name),
    normalizePart(company.location),
  ].join("|");
}

export function dedupeCompanies(companies: Company[]): {
  companies: Company[];
  removed: number;
} {
  const seen = new Set<string>();
  const unique: Company[] = [];

  for (const company of companies) {
    // Prefer the provider id; fall back to the composite only when it is absent.
    const key = company.providerId
      ? `id:${company.providerId.toLowerCase()}`
      : `c:${compositeKey(company)}`;

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(company);
  }

  return { companies: unique, removed: companies.length - unique.length };
}
