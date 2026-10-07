import type { Company, SearchCriteria } from "@/types";

/**
 * The loose, provider-shaped payload we receive from the external data source.
 *
 * Every field is optional and names vary between providers, which is exactly
 * why normalizeCompany() exists. This type intentionally stays permissive:
 * validating it is the normalizer's job, not TypeScript's.
 */
export interface RawProviderCompany {
  provider_id?: string;
  id?: string;
  name?: string;
  company_name?: string;
  organization_name?: string;

  domain?: string;
  primary_domain?: string;
  website?: string;
  website_url?: string;

  industry?: string;
  sector?: string;

  location?: string;
  hq_location?: string;
  headquarters?: string;

  employee_count?: number | string;
  employees?: number | string;
  employee_range?: string;
  size?: string;

  contact?: {
    name?: string;
    email?: string;
    email_verified?: boolean;
  };

  [key: string]: unknown;
}

/**
 * What every lead provider must expose.
 *
 * `supportsEmployeeCount` is part of the contract because the search form asks
 * for a company size. A provider that cannot supply employee counts must say so
 * rather than let the app imply results were filtered by size when they were
 * not.
 */

/** Everything a provider reports about one search, including data-quality counts. */
export interface ProviderSearchResult {
  companies: Company[];
  /** Records collapsed because the provider returned the same business twice. */
  duplicatesRemoved: number;
  /** Records dropped because they carried no usable company name. */
  recordsRejected: number;
}

export interface BusinessProvider {
  /** Shown in server logs and diagnostics. */
  name: string;
  /** False when the provider publishes no employee data. */
  supportsEmployeeCount: boolean;
  searchBusinesses(criteria: SearchCriteria): Promise<ProviderSearchResult>;
}

export type { SearchCriteria };
