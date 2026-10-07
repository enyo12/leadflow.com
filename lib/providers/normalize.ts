import type { Company, EmailStatus } from "@/types";
import type { RawProviderCompany } from "./types";

/**
 * Turns an arbitrary provider payload into our internal Company shape.
 *
 * Rules:
 *  - Never throw. A malformed record yields nulls, not a crashed search.
 *  - Try known field-name variants in priority order.
 *  - Keep the untouched payload in rawData for debugging.
 */

function firstString(
  raw: RawProviderCompany,
  keys: (keyof RawProviderCompany)[],
): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(
  raw: RawProviderCompany,
  keys: (keyof RawProviderCompany)[],
): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = parseEmployeeCount(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * Accepts "120", "120 employees", "51-200", "500+".
 * Ranges collapse to their lower bound; anything unparseable returns null.
 */
function parseEmployeeCount(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;

  // "51-200" / "51 - 200" / "51–200"
  const range = trimmed.match(/^(\d+)\s*[-–—]\s*(\d+)/);
  if (range) return Number(range[1]);

  // "500+"
  const plus = trimmed.match(/^(\d+)\s*\+/);
  if (plus) return Number(plus[1]);

  const exact = trimmed.match(/^(\d+)/);
  return exact ? Number(exact[1]) : null;
}

/** Extracts a bare hostname so we have a consistent `domain` for dedupe and display. */
function toDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function normalizeEmailStatus(raw: RawProviderCompany): EmailStatus {
  const email = raw.contact?.email;
  if (typeof email !== "string" || email.trim() === "") return "not_found";
  return raw.contact?.email_verified === true ? "verified" : "unverified";
}

/** Stable, URL-safe id so a company can be linked to from a route. */
function toId(providerId: string, name: string): string {
  return (
    providerId ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export function normalizeCompany(raw: RawProviderCompany): Company | null {
  const name = firstString(raw, ["name", "company_name", "organization_name"]);
  if (!name) return null; // A company with no name is unusable.

  const providerId =
    firstString(raw, ["provider_id", "id"]) ??
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const website = firstString(raw, ["website", "website_url"]);
  const domain = toDomain(firstString(raw, ["domain", "primary_domain"]) ?? website);

  return {
    id: toId(providerId, name),
    providerId,
    name,
    domain,
    website: website ?? (domain ? `https://${domain}` : null),
    industry: firstString(raw, ["industry", "sector"]),
    location: firstString(raw, ["location", "hq_location", "headquarters"]),
    employeeCount: firstNumber(raw, ["employee_count", "employees", "size"]),
    contactName: raw.contact?.name?.trim() || null,
    contactEmail: raw.contact?.email?.trim() || null,
    emailStatus: normalizeEmailStatus(raw),
    rawData: raw as Record<string, unknown>,
  };
}

export function normalizeCompanies(raws: RawProviderCompany[]): Company[] {
  return raws
    .map(normalizeCompany)
    .filter((company): company is Company => company !== null);
}
