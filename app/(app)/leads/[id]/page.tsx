import { notFound } from "next/navigation";

import { LeadDetail } from "@/components/lead-detail";
import { isAiConfigured } from "@/lib/ai/claude";
import { requireSessionUser } from "@/lib/auth";
import { getLeadByCompanyId } from "@/lib/data/leads";
import { COMPANY_SIZES, type CompanySize, type SearchCriteria } from "@/types";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Rebuilds the search context from the query string. Values are validated
 * against the allowed list before use — never trusted as-is.
 */
function parseCriteria(
  query: Record<string, string | string[] | undefined>,
): SearchCriteria | undefined {
  const industry = firstValue(query.industry) ?? "";
  const location = firstValue(query.location) ?? "";

  if (industry === "" && location === "") return undefined;

  const rawSize = firstValue(query.size);
  const companySize: CompanySize = COMPANY_SIZES.some(
    (option) => option.value === rawSize,
  )
    ? (rawSize as CompanySize)
    : "51-200";

  return { industry, location, companySize };
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: PageProps<"/leads/[id]">) {
  const user = await requireSessionUser("/leads");
  const { id } = await params;
  const query = await searchParams;

  // Scoped to the signed-in user, so another user's company id resolves to
  // nothing and renders a 404 rather than leaking the record.
  const lead = await getLeadByCompanyId(user.id, id);
  if (!lead) notFound();

  return (
    <LeadDetail
      company={lead.company}
      analysis={lead.analysis}
      status={lead.status}
      analyzedAt={lead.analyzedAt}
      criteria={parseCriteria(query)}
      aiConfigured={isAiConfigured()}
    />
  );
}
