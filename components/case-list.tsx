import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/geo";
import { categoryLabel } from "@/lib/civic";
import { CaseRef, PhaseRail, StatusTag, Tally } from "@/components/status";

export type CaseSummary = {
  _id: string;
  caseNumber: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  address: string;
  confirmationCount: number;
  evidenceCount: number;
  createdAt: number;
  distanceKm?: number;
};

/**
 * Column grid shared by the header and every row, so they stay aligned.
 * Mobile shows a full-width card row; from `md` up it becomes a table-like
 * grid so the same information is readable at a glance across many rows.
 */
function cols(hasDistance: boolean) {
  return cn(
    // Mobile: full-width card with stacked information.
    "grid grid-cols-[1fr] items-start gap-3",
    // Desktop: five-column table layout.
    "md:grid-cols-[7rem_5.5rem_minmax(0,1fr)_auto_7rem]",
    hasDistance
      ? "md:grid-cols-[7rem_5.5rem_minmax(0,1fr)_5.5rem_7rem]"
      : "md:grid-cols-[7rem_5.5rem_minmax(0,1fr)_7rem]",
  );
}

function Header({ hasDistance }: { hasDistance: boolean }) {
  const cells = (
    <>
      <span>Case</span>
      <span>Confirmed</span>
      <span>Report</span>
      {hasDistance && <span className="hidden md:block text-right">Near</span>}
      <span className="hidden md:block">Stage</span>
    </>
  );
  return (
    <div
      className={cn(
        cols(hasDistance),
        "hidden border-b border-border pb-2 md:grid",
      )}
      aria-hidden
    >
      {cells}
    </div>
  );
}

export function CaseRow({
  issue,
  className,
}: {
  issue: CaseSummary;
  className?: string;
}) {
  const hasDistance = issue.distanceKm !== undefined;

  return (
    <Link
      href={`/issues/${issue._id}`}
      className={cn(
        cols(hasDistance),
        "group border-b border-border py-4 transition-colors hover:bg-muted/50",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {/* Mobile: case ref + category on top row */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2">
          <CaseRef value={issue.caseNumber} className="text-foreground" />
          <StatusTag status={issue.status} emphasis />
        </div>
        <p className="mt-0.5 text-[0.6875rem] font-medium tracking-[0.07em] text-muted-foreground uppercase">
          {categoryLabel(issue.category)}
        </p>
      </div>

      {/* Desktop: case ref column */}
      <div className="hidden min-w-0 md:block">
        <CaseRef value={issue.caseNumber} className="text-foreground" />
        <div className="mt-1 text-[0.6875rem] leading-none font-medium tracking-[0.07em] text-muted-foreground uppercase">
          {categoryLabel(issue.category)}
        </div>
      </div>

      {/* Confirmation tally */}
      <div className={cn("md:hidden", hasDistance && "flex items-center justify-between")}>
        <Tally count={issue.confirmationCount} />
        {hasDistance && (
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            {formatDistance(issue.distanceKm ?? NaN)}
          </span>
        )}
      </div>
      <div className="hidden md:block">
        <Tally count={issue.confirmationCount} />
      </div>

      {/* Title + address */}
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] leading-snug font-medium text-pretty group-hover:underline group-hover:underline-offset-4">
          {issue.title}
        </p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
          {issue.address}
        </p>
      </div>

      {/* Distance — desktop only, shown inline with tally on mobile */}
      {hasDistance && (
        <div className="hidden text-right font-mono text-[0.75rem] text-muted-foreground md:block">
          {formatDistance(issue.distanceKm ?? NaN)}
        </div>
      )}

      {/* Status — desktop only, shown alongside ref on mobile */}
      <div className="hidden md:block">
        <PhaseRail status={issue.status} labels={false} />
        <StatusTag status={issue.status} />
      </div>
    </Link>
  );
}

export function CaseLedger({
  issues,
  showDistance = false,
  skeletonCount = 0,
  className,
}: {
  issues?: CaseSummary[];
  showDistance?: boolean;
  skeletonCount?: number;
  className?: string;
}) {
  if (skeletonCount > 0) {
    return (
      <div className={className}>
        <Header hasDistance={showDistance} />
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className={cn(cols(showDistance), "border-b border-border py-4")}
          >
            {/* Case ref + category */}
            <div className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded-[3px] bg-muted" />
              <div className="h-2.5 w-12 animate-pulse rounded-[3px] bg-muted" />
            </div>
            {/* Tally */}
            <div className="flex items-end gap-[2px]">
              {[0, 1, 2].map((k) => (
                <div
                  key={k}
                  className={cn(
                    "w-[3px] animate-pulse rounded-[1px]",
                    k === 1 ? "h-2.5 bg-muted" : "h-2 bg-muted",
                  )}
                />
              ))}
            </div>
            {/* Title + address */}
            <div className="space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded-[3px] bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded-[3px] bg-muted" />
            </div>
            {showDistance && (
              <div className="hidden h-3 w-10 animate-pulse rounded-[3px] bg-muted md:block" />
            )}
            {/* Status */}
            <div className="hidden items-center justify-end gap-3 md:flex">
              <div className="hidden h-[3px] w-16 animate-pulse rounded-[1px] bg-muted md:block" />
              <div className="h-2.5 w-16 animate-pulse rounded-[3px] bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <Header hasDistance={showDistance} />
      {issues?.map((issue) => <CaseRow key={issue._id} issue={issue} />)}
    </div>
  );
}
