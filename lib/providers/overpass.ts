import type { SearchCriteria } from "@/types";
import type { RawProviderCompany } from "./types";

/**
 * OpenStreetMap provider, via two official OSM APIs:
 *
 *   Nominatim   — resolves the user's location text into a bounding box.
 *   Overpass    — returns business records inside that box.
 *
 * Neither requires an API key or an account. Both are free public services with
 * fair-use policies, which is why this module keeps its request count low:
 * location lookups are cached, results are capped, and nothing is retried
 * automatically.
 *
 * Both services require a User-Agent that identifies the caller.
 *
 * What this provider does NOT give us: employee counts. OpenStreetMap has no
 * field for them, so `employee_count` is always null and company-size filtering
 * cannot be applied. That limitation is surfaced to the UI rather than hidden —
 * see PROVIDER_SUPPORTS_EMPLOYEE_COUNT in ./business-provider.
 */

const OVERPASS_ENDPOINT =
  process.env.LEAD_PROVIDER_OVERPASS_URL ??
  "https://overpass-api.de/api/interpreter";

const NOMINATIM_ENDPOINT =
  process.env.LEAD_PROVIDER_NOMINATIM_URL ??
  "https://nominatim.openstreetmap.org/search";

const USER_AGENT =
  process.env.LEAD_PROVIDER_USER_AGENT ?? "LeadFlow/0.1 (prototype)";

/** Maximum companies persisted per search. Keeps cost and payloads bounded. */
export const MAX_RESULTS = 40;
/** Ask for a few more than we keep, so de-duplication has slack. */
const FETCH_LIMIT = 60;

const GEOCODE_TIMEOUT_MS = 10_000;
const OVERPASS_TIMEOUT_MS = 30_000;

export type ProviderErrorKind =
  | "location_not_found"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "bad_response"
  | "no_provider";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;

  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Input sanitising
//
// The industry and location strings are interpolated into an Overpass QL query
// and a Nominatim query string. Both are user input, so untrusted. Everything
// outside a conservative allow-list is dropped, which removes any chance of
// injecting query syntax (quotes, brackets, backslashes are all stripped).
// ---------------------------------------------------------------------------

export function sanitizeQueryText(value: string, maxLength = 60): string {
  return value
    .replace(/[^A-Za-z0-9 .,'&/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Escapes regex metacharacters — the sanitised text still allows `.` and `-`. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Industry → OpenStreetMap tag values
//
// OSM has its own fixed vocabulary. Rather than build a large taxonomy, this is
// a deliberately short alias table covering the industries a prototype user is
// likely to type. Anything not listed falls back to matching the keyword
// against the business name and its category.
// ---------------------------------------------------------------------------

const INDUSTRY_TAGS: Record<string, string[]> = {
  software: ["it", "computer"],
  technology: ["it", "computer"],
  tech: ["it", "computer"],
  it: ["it", "computer"],
  marketing: ["advertising_agency", "marketing"],
  advertising: ["advertising_agency"],
  finance: ["financial", "accountant", "insurance"],
  financial: ["financial", "accountant"],
  accounting: ["accountant"],
  legal: ["lawyer", "notary"],
  law: ["lawyer"],
  consulting: ["consulting", "consultant"],
  construction: ["builder", "construction"],
  realestate: ["estate_agent", "property_management"],
  property: ["estate_agent", "property_management"],
  healthcare: ["doctor", "clinic", "dentist"],
  health: ["doctor", "clinic"],
  education: ["educational_institution", "school"],
  manufacturing: ["factory", "metal_construction"],
  logistics: ["logistics", "moving_company"],
  design: ["architect", "graphic_design"],
  recruitment: ["employment_agency"],
  staffing: ["employment_agency"],
  insurance: ["insurance"],
  research: ["research"],
  nonprofit: ["ngo", "association", "charity"],
  ngo: ["ngo", "association"],
  // Consumer-facing categories, reachable via the amenity key.
  restaurant: ["restaurant", "fast_food"],
  food: ["restaurant", "fast_food", "cafe"],
  cafe: ["cafe"],
  coffee: ["cafe"],
  hotel: ["hotel", "guest_house"],
  hospitality: ["hotel", "restaurant"],
  retail: ["clothes", "supermarket", "convenience"],
  fitness: ["gym", "fitness_centre"],
  beauty: ["beauty", "hairdresser"],
};

/** Nicer display labels for the OSM values we are most likely to surface. */
const CATEGORY_LABELS: Record<string, string> = {
  it: "IT services",
  computer: "Computers & IT",
  lawyer: "Legal services",
  notary: "Notary services",
  estate_agent: "Real estate",
  property_management: "Property management",
  advertising_agency: "Advertising & marketing",
  marketing: "Marketing",
  employment_agency: "Recruitment",
  insurance: "Insurance",
  accountant: "Accounting",
  financial: "Financial services",
  consulting: "Consulting",
  consultant: "Consulting",
  architect: "Architecture",
  graphic_design: "Design",
  company: "Company office",
  educational_institution: "Education",
  school: "Education",
  research: "Research",
  ngo: "Non-profit",
  association: "Association",
  charity: "Non-profit",
  moving_company: "Logistics",
  logistics: "Logistics",
  metal_construction: "Manufacturing",
  factory: "Manufacturing",
  builder: "Construction",
  construction: "Construction",
  clinic: "Healthcare",
  doctor: "Healthcare",
  dentist: "Healthcare",
  hotel: "Hospitality",
  guest_house: "Hospitality",
  restaurant: "Restaurants",
  fast_food: "Restaurants",
  cafe: "Cafés",
};

function lookupIndustryTags(industry: string): string[] | null {
  const key = industry.toLowerCase().replace(/[^a-z0-9]/g, "");
  return INDUSTRY_TAGS[key] ?? null;
}

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Nominatim asks for at most one request per second and no heavy automated
 * use. A small in-process cache means repeat searches for the same location —
 * which is the common case while testing — cost nothing at all.
 */
const geocodeCache = new Map<string, BoundingBox>();
const GEOCODE_CACHE_LIMIT = 200;

async function geocode(location: string): Promise<BoundingBox> {
  const cacheKey = location.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("q", location);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ProviderError("timeout", "Location lookup timed out.");
    }
    throw new ProviderError("unavailable", "Location lookup failed.");
  }

  if (response.status === 429 || response.status === 403) {
    throw new ProviderError("rate_limited", "Location lookup is rate limited.");
  }
  if (!response.ok) {
    throw new ProviderError("unavailable", "Location lookup failed.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError("bad_response", "Location lookup returned invalid data.");
  }

  const first = Array.isArray(payload) ? payload[0] : null;
  const box = first?.boundingbox;

  // Nominatim returns [south, north, west, east] as strings.
  if (!Array.isArray(box) || box.length !== 4) {
    throw new ProviderError(
      "location_not_found",
      `No location matched "${location}".`,
    );
  }

  const [south, north, west, east] = box.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) {
    throw new ProviderError("bad_response", "Location lookup returned invalid data.");
  }

  const boundingBox: BoundingBox = { south, west, north, east };

  if (geocodeCache.size >= GEOCODE_CACHE_LIMIT) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) geocodeCache.delete(oldest);
  }
  geocodeCache.set(cacheKey, boundingBox);

  return boundingBox;
}

// ---------------------------------------------------------------------------
// Overpass query
// ---------------------------------------------------------------------------

/**
 * The OSM keys that can carry a business category. `amenity` is included so
 * consumer-facing businesses (restaurants, hotels, cafés) are reachable — they
 * are tagged there, not under office/craft/shop.
 */
const BUSINESS_KEYS = "^(office|craft|shop|amenity)$";

function buildOverpassQuery(
  box: BoundingBox,
  industry: string,
  tags: string[] | null,
): string {
  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const clauses: string[] = [];

  if (tags && tags.length > 0) {
    // Match the provider's own category vocabulary.
    clauses.push(
      `nwr[~"${BUSINESS_KEYS}"~"^(${tags.join("|")})$",i](${bbox});`,
    );
  }

  // Matching the name is useful in every case — it catches businesses the
  // category tags miss, and it is the ONLY signal when the industry is not in
  // the alias table.
  //
  // There is deliberately no "sweep every business POI" fallback for unknown
  // industries: inside a large city that clause returns thousands of shops,
  // fills the result cap with unrelated records, and both starves the name
  // matches and makes the query slow enough to time out.
  const keyword = sanitizeQueryText(industry, 40);
  if (keyword !== "") {
    clauses.push(`nwr["name"~"${escapeRegex(keyword)}",i](${bbox});`);
  }

  return `[out:json][timeout:25];(${clauses.join("")});out center ${FETCH_LIMIT};`;
}

interface OsmElement {
  type?: string;
  id?: number;
  tags?: Record<string, string>;
}

/** Pulls the category out of whichever business tag the element carries. */
function categoryOf(tags: Record<string, string>): string | null {
  return (
    tags.office ??
    tags.craft ??
    tags.shop ??
    tags.amenity ??
    tags.company ??
    null
  );
}

/** "estate_agent" → "Real estate", via the label table; otherwise title-cased. */
function humanizeCategory(value: string): string {
  const known = CATEGORY_LABELS[value.toLowerCase()];
  if (known) return known;

  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function composeAddress(tags: Record<string, string>): string | null {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");

  const parts = [
    street,
    tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"],
    tags["addr:state"],
    tags["addr:postcode"],
    tags["addr:country"],
  ].filter((part) => typeof part === "string" && part.trim() !== "");

  return parts.length > 0 ? parts.join(", ") : null;
}

function toRawCompany(
  element: OsmElement,
  fallbackLocation: string,
): RawProviderCompany | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name || element.id === undefined) return null;

  const website =
    tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  const category = categoryOf(tags);
  const email = tags.email ?? tags["contact:email"] ?? null;

  return {
    // Stable across queries — this is the primary de-duplication signal.
    provider_id: `${element.type ?? "node"}/${element.id}`,
    name,
    website: website ?? undefined,
    // The provider's own category, honestly labelled. Null when untagged.
    industry: category ? humanizeCategory(category) : undefined,
    location: composeAddress(tags) ?? fallbackLocation,
    // OpenStreetMap publishes no employee data. Left undefined so the
    // normalizer yields null rather than a guessed value.
    employee_count: undefined,
    contact: email ? { email } : undefined,
    // Bounded raw payload: the OSM identity plus its tags. Tags are small and
    // are what makes a record debuggable later.
    osm_type: element.type,
    osm_id: element.id,
    osm_tags: tags,
  };
}

export async function searchOpenStreetMap(
  criteria: SearchCriteria,
): Promise<RawProviderCompany[]> {
  const location = sanitizeQueryText(criteria.location, 60);
  const industry = sanitizeQueryText(criteria.industry, 60);

  if (location === "" || industry === "") {
    throw new ProviderError("bad_response", "Both industry and location are required.");
  }

  const boundingBox = await geocode(location);
  const tags = lookupIndustryTags(industry);
  const query = buildOverpassQuery(boundingBox, industry, tags);

  let response: Response;
  try {
    response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ProviderError("timeout", "Business lookup timed out.");
    }
    throw new ProviderError("unavailable", "Business lookup failed.");
  }

  if (response.status === 429) {
    throw new ProviderError("rate_limited", "Business lookup is rate limited.");
  }
  // The public Overpass instances answer 504 when a query outruns their budget.
  if (response.status === 504 || response.status === 503) {
    throw new ProviderError("timeout", "Business lookup timed out.");
  }
  if (response.status === 400) {
    throw new ProviderError("bad_response", "The business lookup was rejected.");
  }
  if (!response.ok) {
    throw new ProviderError("unavailable", "Business lookup failed.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError("bad_response", "Business lookup returned invalid data.");
  }

  const elements = (payload as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) {
    throw new ProviderError("bad_response", "Business lookup returned invalid data.");
  }

  const raws = (elements as OsmElement[])
    .map((element) => toRawCompany(element, location))
    .filter((company): company is RawProviderCompany => company !== null);

  return tagFilter(raws, industry, tags);
}

/**
 * When the industry is outside the alias table the Overpass query could only
 * narrow by name, so the local category/name match does the real filtering.
 * When it is in the table, the provider already filtered — no second pass.
 */
function tagFilter(
  raws: RawProviderCompany[],
  industry: string,
  tags: string[] | null,
): RawProviderCompany[] {
  if (tags) return raws;

  const needle = industry.toLowerCase();
  return raws.filter((raw) => {
    const name = (raw.name ?? "").toLowerCase();
    const category = (raw.industry ?? "").toLowerCase();
    return name.includes(needle) || category.includes(needle);
  });
}
