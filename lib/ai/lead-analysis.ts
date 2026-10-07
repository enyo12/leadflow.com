import "server-only";

import { AiError, complete, getModel } from "./claude";
import {
  LEAD_ANALYSIS_JSON_SCHEMA,
  labelForScore,
  leadAnalysisSchema,
  type LeadAnalysisOutput,
} from "./schemas";

/**
 * Builds the model input, makes the one call, and validates what comes back.
 *
 * Nothing reaches this module except data the provider actually supplied and
 * the criteria the user actually searched with. There is no web lookup, no
 * enrichment, and no second call: the model reasons over the supplied fields or
 * reports them as unknown.
 */

/** The company fields that may be shown to the model. */
export interface CompanyForAnalysis {
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  /** The provider's own payload; reduced before sending. */
  rawData: Record<string, unknown>;
}

export interface AnalysisInput {
  criteria: {
    industry: string;
    location: string;
    companySize: string;
  };
  company: CompanyForAnalysis;
}

/**
 * Descriptive OSM tags worth considering. This is an allow-list, not a
 * pass-through: the provider payload also carries internal identifiers, and
 * there is no reason to spend tokens on those or to widen what leaves the
 * server. `addr:*` is omitted because the address is already in `location`.
 */
const USEFUL_TAGS = [
  "description",
  "operator",
  "brand",
  "industry",
  "office",
  "craft",
  "shop",
  "amenity",
  "company",
  "healthcare",
  "cuisine",
  "education",
] as const;

const MAX_TAG_VALUE_CHARS = 160;
const MAX_TAGS = 8;

/**
 * Reduces the stored provider payload to a few short descriptive tags.
 *
 * Returns null when nothing useful survives, so an empty object is never sent.
 *
 * Exported for the Phase 4 verification harness — it is the boundary that
 * decides what leaves the server, so it is worth being able to test directly.
 */
export function summarizeProviderData(
  rawData: Record<string, unknown>,
): Record<string, string> | null {
  const tags = rawData.osm_tags;
  if (typeof tags !== "object" || tags === null || Array.isArray(tags)) {
    return null;
  }

  const source = tags as Record<string, unknown>;
  const summarized: Record<string, string> = {};

  for (const key of USEFUL_TAGS) {
    const value = source[key];
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed === "") continue;

    summarized[key] = trimmed.slice(0, MAX_TAG_VALUE_CHARS);
    if (Object.keys(summarized).length >= MAX_TAGS) break;
  }

  return Object.keys(summarized).length > 0 ? summarized : null;
}

/** `51-200` → the words a person would use. */
function describeSize(size: string): string {
  return size === "500+" ? "500 or more" : size.replace("-", " to ");
}

/**
 * The system prompt.
 *
 * Deliberately short. Every sentence here is either a constraint the model
 * would otherwise violate or the output contract; there is no persuasion and no
 * persona padding, both of which cost tokens on every single analysis.
 *
 * Exported so the verification harness can measure it — prompt size is a cost
 * line on every analysis, so it should be reviewed rather than assumed.
 */
export const SYSTEM_PROMPT = `You are a B2B lead qualification analyst. You assess how well a company matches a user's search criteria, using ONLY the data provided in the user message.

RULES

1. Use only the supplied data. You have no web access and no other source.
2. NEVER invent or estimate: revenue, funding, headcount, buying intent, budget, pain points, technologies, recent events, contact names, email addresses, or phone numbers. If it is not in the supplied data, it is unknown.
3. If you reason beyond the supplied facts, that is an inference. Mark every inferred signal by starting it with "Inferred: ". Unmarked signals must be directly supported by a supplied field.
4. Missing information lowers confidence. It does NOT by itself make a company a poor lead. Do not penalise a company for a field the provider does not publish.
5. The user's criteria are the basis for scoring. Judge industry match, location match, and company-size match on the evidence available.

SCORING (fit_score, 0-100)

- 80-100: strong match on the criteria
- 60-79: reasonable match
- 40-59: weak or uncertain match
- 0-39: poor match

fit_label MUST correspond to fit_score: 80-100 "Excellent Fit", 60-79 "Good Fit", 40-59 "Possible Fit", 0-39 "Poor Fit".

CONFIDENCE (0-1)

How much of the assessment the supplied data actually supports. Sparse data means low confidence, however the company scores.

OUTPUT

Reply with a single JSON object and nothing else. No markdown, no code fences, no commentary. It must match this schema exactly:

${JSON.stringify(LEAD_ANALYSIS_JSON_SCHEMA)}

Keep every string short. signals are one line each and evidence-based. unknowns list what the data could not establish.`;

/**
 * Renders the input as labelled lines rather than nested JSON: fewer tokens,
 * and the model reads a missing field as "not provided" more reliably than it
 * reads a null.
 */
function buildUserMessage(input: AnalysisInput): string {
  const { criteria, company } = input;

  const lines: string[] = [
    "SEARCH CRITERIA (what the user is looking for)",
    `Industry: ${criteria.industry}`,
    `Location: ${criteria.location}`,
    `Company size: ${describeSize(criteria.companySize)} employees`,
    "",
    "COMPANY (the candidate lead)",
    `Name: ${company.name}`,
  ];

  // Omitted rather than sent as null, so absence is unambiguous.
  if (company.industry) lines.push(`Industry: ${company.industry}`);
  if (company.location) lines.push(`Location: ${company.location}`);
  if (company.domain) lines.push(`Domain: ${company.domain}`);
  if (company.website) lines.push(`Website: ${company.website}`);

  lines.push(
    company.employeeCount === null
      ? "Employee count: not available from the data provider"
      : `Employee count: ${company.employeeCount}`,
  );

  const providerData = summarizeProviderData(company.rawData);
  if (providerData) {
    lines.push("", "PROVIDER TAGS (raw, from the data provider)");
    for (const [key, value] of Object.entries(providerData)) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(
    "",
    "Assess this company against the criteria and reply with the JSON object.",
  );

  return lines.join("\n");
}

export class AnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisValidationError";
  }
}

/**
 * Pulls the JSON object out of the model's reply.
 *
 * The prompt forbids code fences, but models add them anyway. Unwrapping a
 * single fenced block is a bounded transformation, and the result still has to
 * pass the schema — this is not an attempt to salvage arbitrary prose.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new AnalysisValidationError("The AI returned an empty response.");
  }

  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;

  // If there is surrounding chatter, take the outermost brace pair.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new AnalysisValidationError("The AI response was not a JSON object.");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AnalysisValidationError("The AI response was not valid JSON.");
  }
}

export interface AnalysisOutcome {
  analysis: LeadAnalysisOutput;
  model: string;
}

/**
 * Runs one analysis. No retries, no caching, no fallback model.
 *
 * Throws AiError for service failures and AnalysisValidationError when the
 * response does not satisfy the schema. Both are controlled: the caller maps
 * them to user-facing text and neither carries raw upstream detail.
 */
export async function analyzeCompany(
  input: AnalysisInput,
): Promise<AnalysisOutcome> {
  const { text, refused } = await complete(SYSTEM_PROMPT, buildUserMessage(input));

  if (refused) {
    throw new AnalysisValidationError(
      "The AI declined to analyze this company.",
    );
  }

  const parsed = leadAnalysisSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    // The issues are logged server-side for debugging; they can quote the
    // model's own output, so they are not returned to the caller.
    console.error(
      "[leadflow] AI response failed validation:",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
    throw new AnalysisValidationError(
      "The AI returned a response we could not use. Please try again.",
    );
  }

  const analysis = parsed.data;

  // Keep the stored pair self-consistent. The prompt states the bands, but a
  // model occasionally scores 85 and labels it "Possible Fit"; the score is the
  // considered judgement, so the label follows it.
  return {
    analysis: { ...analysis, fit_label: labelForScore(analysis.fit_score) },
    model: getModel(),
  };
}

export { AiError };
