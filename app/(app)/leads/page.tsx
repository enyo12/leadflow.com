import Link from "next/link";
import { Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { LeadsWorkspace } from "@/components/leads-workspace";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { isAiConfigured } from "@/lib/ai/claude";
import { requireSessionUser } from "@/lib/auth";
import { listLeads } from "@/lib/data/leads";

export const metadata = { title: "Leads" };

export default async function LeadsPage() {
  const user = await requireSessionUser("/leads");
  const leads = await listLeads(user.id);
  const analyzedCount = leads.filter((lead) => lead.analysis !== null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${leads.length} companies in your workspace · ${analyzedCount} analyzed.`}
        actions={
          <Link href="/searches" className={buttonVariants()}>
            <Search className="size-4" aria-hidden="true" />
            New search
          </Link>
        }
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No leads yet"
          description="Companies you retrieve from a search are saved here automatically, and stay here after you refresh."
          action={
            <Link href="/searches" className={buttonVariants()}>
              Run your first search
            </Link>
          }
        />
      ) : (
        <LeadsWorkspace leads={leads} aiConfigured={isAiConfigured()} />
      )}
    </div>
  );
}
