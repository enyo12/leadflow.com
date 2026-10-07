"use client";

import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";

import { AnalyzeLeadButton } from "@/components/analyze-lead-button";
import {
  LeadScoreBadge,
  LeadStatusBadge,
} from "@/components/lead-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fitLabelTone,
  formatConfidence,
  splitSignals,
} from "@/lib/analysis-display";
import type { Lead, LeadAnalysis, SearchCriteria } from "@/types";

/** Builds the detail link, carrying the search context with it. */
function detailHref(lead: Lead, criteria?: SearchCriteria) {
  const params = new URLSearchParams();
  if (criteria) {
    if (criteria.industry) params.set("industry", criteria.industry);
    if (criteria.location) params.set("location", criteria.location);
    params.set("size", criteria.companySize);
  }
  const query = params.toString();
  return `/leads/${lead.company.id}${query ? `?${query}` : ""}`;
}

function UnknownText() {
  return <span className="text-muted-foreground">Not available</span>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function WebsiteLink({ lead }: { lead: Lead }) {
  const { company } = lead;

  if (!company.website) {
    return (
      <p className="text-xs text-muted-foreground">No website on file</p>
    );
  }

  return (
    <a
      href={company.website}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {/* break-all so a long domain can never widen the card. */}
      <span className="break-all">{company.domain ?? company.website}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function ContactBlock({ lead }: { lead: Lead }) {
  const { company } = lead;

  if (!company.contactName && !company.contactEmail) {
    return <UnknownText />;
  }

  return (
    <div className="min-w-0 space-y-1">
      {company.contactName ? (
        <p className="text-sm break-words">{company.contactName}</p>
      ) : null}
      {company.contactEmail ? (
        <p className="text-xs break-all text-muted-foreground">
          {company.contactEmail}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No email on file</p>
      )}
      {company.emailStatus !== "not_found" ? (
        <Badge
          variant={company.emailStatus === "verified" ? "success" : "warning"}
        >
          {company.emailStatus === "verified" ? "Verified" : "Unverified"}
        </Badge>
      ) : null}
    </div>
  );
}

/** The AI-written half of the card. All text wraps; nothing is clipped. */
function AnalysisBlock({ analysis }: { analysis: LeadAnalysis }) {
  const { evidence, inferred } = splitSignals(analysis.signals);

  return (
    <div className="min-w-0 space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={fitLabelTone(analysis.fitLabel)}>
          {analysis.fitLabel}
        </Badge>
        <Badge variant="info">AI inference</Badge>
        <span className="text-xs text-muted-foreground">
          Confidence {formatConfidence(analysis.confidence)}
        </span>
      </div>

      {evidence.length > 0 ? (
        <div className="min-w-0">
          <h4 className="text-sm font-medium">Why this lead fits</h4>
          <ul className="mt-1.5 space-y-1.5">
            {evidence.map((signal) => (
              <li key={signal} className="flex min-w-0 gap-2 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words">{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inferred.length > 0 ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">What the AI inferred</h4>
            <Badge variant="outline">Not in your data</Badge>
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {inferred.map((signal) => (
              <li key={signal} className="flex min-w-0 gap-2 text-sm">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-info"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words text-muted-foreground">
                  {signal}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="min-w-0">
        <h4 className="text-sm font-medium">Summary</h4>
        <p className="mt-1.5 text-sm break-words text-muted-foreground">
          {analysis.summary}
        </p>
      </div>

      <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2.5">
        <h4 className="text-sm font-medium">Recommended action</h4>
        <p className="mt-1 text-sm break-words">{analysis.recommendedAction}</p>
      </div>

      {analysis.unknowns.length > 0 ? (
        <div className="min-w-0">
          <h4 className="text-sm font-medium">Not established</h4>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {analysis.unknowns.map((unknown) => (
              <li key={unknown}>
                <Badge variant="secondary">{unknown}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface LeadCardProps {
  lead: Lead;
  /** "compact" drops the analysis block — used by the dashboard preview. */
  variant?: "full" | "compact";
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (leadId: string) => void;
  criteria?: SearchCriteria;
  /** False when ANTHROPIC_API_KEY is absent; the action is hidden, not broken. */
  aiConfigured: boolean;
}

export function LeadCard({
  lead,
  variant = "full",
  selectable = false,
  selected = false,
  onToggleSelect,
  criteria,
  aiConfigured,
}: LeadCardProps) {
  const { company, analysis } = lead;
  const viewHref = detailHref(lead, criteria);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={viewHref}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        View
      </Link>
      <AnalyzeLeadButton
        companyId={company.id}
        analyzed={analysis !== null}
        aiConfigured={aiConfigured}
        size="sm"
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <article className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 text-sm font-semibold break-words">
                {company.name}
              </h3>
              <LeadStatusBadge status={lead.status} />
            </div>

            <WebsiteLink lead={lead} />

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="break-words">
                {company.industry ?? "Industry not available"}
              </span>
              <span aria-hidden="true">·</span>
              <span className="break-words">
                {company.location ?? "Location not available"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {company.employeeCount === null
                  ? "Size not available"
                  : `${company.employeeCount} employees`}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <LeadScoreBadge score={analysis?.fitScore ?? null} />
            {actions}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      <div className="grid min-w-0 gap-5 p-5 lg:grid-cols-3">
        {/* Company facts — provider data. */}
        <div className="min-w-0 space-y-4 lg:col-span-1">
          <div className="flex min-w-0 items-start gap-3">
            {selectable ? (
              <Checkbox
                className="mt-1"
                checked={selected}
                onChange={() => onToggleSelect?.(lead.id)}
                aria-label={`Select ${company.name}`}
              />
            ) : null}

            <div className="min-w-0 flex-1 space-y-1.5">
              <h3 className="text-base font-semibold break-words">
                {company.name}
              </h3>
              <WebsiteLink lead={lead} />
            </div>
          </div>

          <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-1">
            <Fact label="Industry">
              {company.industry ?? <UnknownText />}
            </Fact>
            <Fact label="Location">
              {company.location ?? <UnknownText />}
            </Fact>
            <Fact label="Company size">
              {company.employeeCount === null ? (
                <UnknownText />
              ) : (
                <span className="tabular-nums">
                  {company.employeeCount} employees
                </span>
              )}
            </Fact>
          </dl>

          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Contact
            </p>
            <div className="mt-1.5">
              <ContactBlock lead={lead} />
            </div>
          </div>
        </div>

        {/* Score, status, actions and the AI analysis. */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <LeadStatusBadge status={lead.status} />
            <LeadScoreBadge score={analysis?.fitScore ?? null} />
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {actions}
            </div>
          </div>

          {analysis ? (
            <AnalysisBlock analysis={analysis} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4">
              <p className="text-sm break-words text-muted-foreground">
                Not analyzed yet — run the analysis to see why this lead fits
                and what to do next.
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
