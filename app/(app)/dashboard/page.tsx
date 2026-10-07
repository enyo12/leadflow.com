import Link from "next/link";
import { Search } from "lucide-react";

import { DashboardStats } from "@/components/dashboard-stats";
import { LeadList } from "@/components/lead-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { isAiConfigured } from "@/lib/ai/claude";
import { requireSessionUser } from "@/lib/auth";
import { listLeads } from "@/lib/data/leads";
import { listSearches } from "@/lib/data/searches";
import { getDashboardStats } from "@/lib/data/stats";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireSessionUser("/dashboard");

  const [stats, searches, leads] = await Promise.all([
    getDashboardStats(user.id),
    listSearches(user.id, 5),
    listLeads(user.id),
  ]);

  const topLeads = leads
    .filter((lead) => lead.analysis !== null)
    .sort((a, b) => (b.analysis?.fitScore ?? 0) - (a.analysis?.fitScore ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your searches and the leads in your workspace."
        actions={
          <Link href="/searches" className={buttonVariants()}>
            <Search className="size-4" aria-hidden="true" />
            New search
          </Link>
        }
      />

      <DashboardStats stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>Recent searches</CardTitle>
        </CardHeader>
        <CardContent className={searches.length === 0 ? undefined : "px-0 py-0"}>
          {searches.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No searches yet"
              description="Run your first search to start building your workspace."
              action={
                <Link href="/searches" className={buttonVariants({ size: "sm" })}>
                  Run a search
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {searches.map((search) => (
                <li
                  key={search.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3.5"
                >
                  <span className="min-w-0 font-medium break-words">
                    {search.criteria.industry}
                  </span>
                  <span className="min-w-0 text-sm text-muted-foreground break-words">
                    {search.criteria.location || "Any location"}
                  </span>
                  <span className="min-w-0 text-sm text-muted-foreground">
                    {search.criteria.companySize} employees
                  </span>
                  <span className="ms-auto flex items-baseline gap-4 text-sm">
                    <span className="tabular-nums">{search.resultCount}</span>
                    <span className="text-muted-foreground">
                      {formatDate(search.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Top leads</h2>
          <Link
            href="/leads"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View all leads
          </Link>
        </div>

        {topLeads.length === 0 ? (
          <EmptyState
            title="No analyzed leads yet"
            description="AI scoring arrives in a later phase. Every company you save from a search already appears on the Leads page."
            action={
              <Link
                href="/leads"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View all leads
              </Link>
            }
          />
        ) : (
          <LeadList
            leads={topLeads}
            variant="compact"
            aiConfigured={isAiConfigured()}
          />
        )}
      </div>
    </div>
  );
}
