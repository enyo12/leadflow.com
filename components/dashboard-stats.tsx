import {
  BadgeCheck,
  Building2,
  Gauge,
  Search,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardStats as Stats } from "@/types";

interface StatCard {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

function buildCards(stats: Stats): StatCard[] {
  return [
    {
      label: "Total searches",
      value: stats.totalSearches.toLocaleString("en-US"),
      hint: "Searches you have run",
      icon: Search,
    },
    {
      label: "Total leads",
      value: stats.totalLeads.toLocaleString("en-US"),
      hint: "Companies saved to your workspace",
      icon: Building2,
    },
    {
      label: "Analyzed leads",
      value: stats.analyzedLeads.toLocaleString("en-US"),
      hint: "Leads scored by AI",
      icon: BadgeCheck,
    },
    {
      label: "Average lead score",
      value: stats.averageScore === null ? "—" : `${stats.averageScore}/100`,
      hint:
        stats.averageScore === null
          ? "No analyzed leads yet"
          : "Across analyzed leads",
      icon: Gauge,
    },
  ];
}

export function DashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {buildCards(stats).map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {card.value}
              </p>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent">
              <card.icon
                className="size-4 text-accent-foreground"
                aria-hidden="true"
              />
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
