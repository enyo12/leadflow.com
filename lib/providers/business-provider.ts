import type { SearchCriteria } from "@/types";
import { dedupeCompanies } from "./dedupe";
import { normalizeCompanies } from "./normalize";
import { MAX_RESULTS, searchOpenStreetMap } from "./overpass";
import type { BusinessProvider, ProviderSearchResult } from "./types";

/**
 * The single entry point the application uses to talk to the outside world.
 *
 * Nothing above this file knows which provider is in use. Swapping providers —
 * or adding a fallback — means changing the `searchBusinesses` implementation
 * here, and nothing else. The UI never imports a provider module directly, and
 * every call happens server-side, so credentials stay off the client.
 */

export const PROVIDER_NAME = "OpenStreetMap (Nominatim + Overpass)";

/**
 * OpenStreetMap carries no employee-count data, so results cannot be filtered
 * by company size. False here means the UI must say so rather than let the user
 * believe their size selection was applied.
 */
export const PROVIDER_SUPPORTS_EMPLOYEE_COUNT = false;

export { MAX_RESULTS };
export { ProviderError, type ProviderErrorKind } from "./overpass";

/**
 * Full pipeline: external API → normalize → validate → de-duplicate → cap.
 *
 * Normalizing drops records with no usable name, so a malformed provider
 * payload can never reach the database as a half-empty row.
 */
export async function searchBusinesses(
  criteria: SearchCriteria,
): Promise<ProviderSearchResult> {
  const raws = await searchOpenStreetMap(criteria);

  const normalized = normalizeCompanies(raws);
  const invalid = raws.length - normalized.length;

  const { companies, removed } = dedupeCompanies(normalized);

  return {
    companies: companies.slice(0, MAX_RESULTS),
    duplicatesRemoved: removed,
    // Records the provider returned that normalization could not use. Reported
    // so a silent quality problem is visible rather than invisible.
    recordsRejected: invalid,
  };
}

export const businessProvider: BusinessProvider = {
  name: PROVIDER_NAME,
  supportsEmployeeCount: PROVIDER_SUPPORTS_EMPLOYEE_COUNT,
  searchBusinesses,
};
