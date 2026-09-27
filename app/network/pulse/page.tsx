"use client";

import { useQuery } from "convex/react";
import { BarChart, Users, CheckCircle2, HardHat } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CATEGORIES } from "@/lib/civic";
import { EmptyState, Skeleton } from "@/components/feedback";
import { PageHeader, PageShell, Section, Meta, ScrollRow } from "@/components/shell";

const OVERVIEW_SKELETON = (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-full" />
      </div>
    ))}
  </div>
);

const CATEGORY_SKELETON = (
  <div className="space-y-4">
    {CATEGORIES.map((c) => (
      <div key={c.value} className="space-y-2">
        <Skeleton className="h-4 w-1/4" />
        <div className="h-3 w-full animate-pulse rounded-[var(--radius)] bg-muted" />
      </div>
    ))}
  </div>
);

export default function PulsePage() {
  const overview = useQuery(api.pulse.overview);
  const byCategory = useQuery(api.pulse.byCategory);

  const loading = overview === undefined || byCategory === undefined;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Civic Network"
        title="Civic Pulse"
        description="What the community is experiencing right now. Every figure is counted from real records — nothing is estimated or seeded."
      />

      {loading ? (
        <>
          <Section label="Overview" rule>
            {OVERVIEW_SKELETON}
          </Section>
          <Section label="By category">
            {CATEGORY_SKELETON}
          </Section>
        </>
      ) : overview.totalCases === 0 && byCategory.rows.every((r) => r.cases === 0 && r.posts === 0) ? (
        <EmptyState
          title="The pulse is quiet"
          body="No cases or posts have been reported yet. The first one will appear here as soon as someone files it."
          icon={BarChart}
        />
      ) : (
        <>
          <Section label="Overview" rule>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={BarChart}
                label="Active reports"
                value={overview.activeCases}
                description={`${overview.totalCases} total · ${overview.resolvedCases} resolved`}
              />
              <StatCard
                icon={CheckCircle2}
                label="Resolved"
                value={overview.resolvedCases}
                description={`${overview.totalCases > 0 ? Math.round((overview.resolvedCases / overview.totalCases) * 100) : 0}% of all cases`}
              />
              <StatCard
                icon={HardHat}
                label="Being worked on"
                value={overview.beingWorkedOn}
                description={`${overview.awaitingContractor} awaiting a contractor`}
              />
              <StatCard
                icon={Users}
                label="Residents affected"
                value={overview.affected}
                description={`${overview.posts} posts · ${overview.comments} comments`}
              />
            </div>
          </Section>

          <Section label="By category">
            <div className="space-y-4">
              {byCategory.rows.map((row) => (
                <CategoryBar key={row.category} row={row} peak={byCategory.peak} />
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Bars are scaled to the busiest category. Zeros are shown — a category with no activity still exists.
            </p>
          </Section>
        </>
      )}

      <ScrollRow className="mt-12 justify-center pb-2">
        <p className="text-center text-xs text-muted-foreground">
          Counts come from live database rows. No fabrication. Empty states show zeros, not placeholders.
        </p>
      </ScrollRow>
    </PageShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <p className="text-[0.75rem] font-mono text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-[2rem] leading-none font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CategoryBar({
  row,
  peak,
}: {
  row: { category: string; label: string; short: string; cases: number; posts: number; resolved: number };
  peak: number;
}) {
  const max = Math.max(1, peak);
  const casesPct = (row.cases / max) * 100;
  const postsPct = (row.posts / max) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-[7rem]">
          <span className="text-[0.6875rem] font-medium tracking-[0.07em] uppercase text-muted-foreground w-[4.5rem] shrink-0">
            {row.short}
          </span>
          <span className="text-[0.8125rem] font-medium">{row.label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Meta label="Cases">{row.cases.toLocaleString()}</Meta>
          <Meta label="Posts">{row.posts.toLocaleString()}</Meta>
          <Meta label="Resolved">{row.resolved.toLocaleString()}</Meta>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-[var(--radius-sm)] bg-muted overflow-hidden">
          <div
            className="h-full bg-status-confirmed/60 transition-all"
            style={{ width: `${casesPct}%` }}
            aria-hidden
          />
        </div>
        <div className="flex-1 h-2 rounded-[var(--radius-sm)] bg-muted overflow-hidden">
          <div
            className="h-full bg-status-active/60 transition-all"
            style={{ width: `${postsPct}%` }}
            aria-hidden
          />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-status-confirmed/60">██</span> Cases
        <span className="mx-1">·</span>
        <span className="text-status-active/60">██</span> Posts
      </div>
    </div>
  );
}