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
 * `distance` collapses away when the feed has no proximity data.
 */
function cols(hasDistance: boolean) {
  return cn(
    "grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-2",
    "lg:grid-cols-[6.5rem_5.5rem_minmax(0,1fr)_4.5rem_9.5rem]",
    hasDistance
      ? "lg:grid-cols-[6.5rem_5.5rem_minmax(0,1fr)_4.5rem_9.5rem]"
      : "lg:grid-cols-[6.5rem_5.5rem_minmax(0,1fr)_9.5rem]",
  );
}

function Header({ hasDistance }: { hasDistance: boolean }) {
  const cells = (
    <>
      <span>Case</span>
      <span>Confirmed</span>
      <span>Report</span>
      {hasDistance && <span className="text-right">Near</span>}
      <span>Stage</span>
    </>
  );
  return (
    <div
      className={cn(
        cols(hasDistance),
        "hidden border-b border-border pb-2 lg:grid",
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
        "group border-b border-border py-3.5 transition-colors hover:bg-muted/50",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div className="min-w-0">
        <CaseRef value={issue.caseNumber} className="text-foreground" />
        <div className="mt-1 text-[0.6875rem] leading-none font-medium tracking-[0.07em] text-muted-foreground uppercase">
          {categoryLabel(issue.category)}
        </div>
      </div>

      <Tally count={issue.confirmationCount} />

      <div className="col-span-2 min-w-0 lg:col-span-1">
        <p className="truncate text-[0.9375rem] leading-snug font-medium text-pretty group-hover:underline group-hover:underline-offset-4">
          {issue.title}
        </p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
          {issue.address}
        </p>
      </div>

      {hasDistance && (
        <div className="hidden text-right font-mono text-[0.75rem] text-muted-foreground lg:block">
          {formatDistance(issue.distanceKm ?? NaN)}
        </div>
      )}

      <div className="col-span-2 flex items-center justify-between gap-3 lg:col-span-1 lg:flex-col lg:items-end lg:gap-1.5">
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
            className={cn(cols(showDistance), "border-b border-border py-3.5")}
          >
            <div className="space-y-1.5">
              <div className="h-3 w-16 animate-pulse rounded-[3px] bg-muted" />
              <div className="h-2.5 w-12 animate-pulse rounded-[3px] bg-muted" />
            </div>
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
            <div className="col-span-2 space-y-1.5 lg:col-span-1">
              <div className="h-3.5 w-2/3 animate-pulse rounded-[3px] bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded-[3px] bg-muted" />
            </div>
            {showDistance && (
              <div className="hidden h-3 w-10 animate-pulse rounded-[3px] bg-muted lg:block" />
            )}
            <div className="col-span-2 flex items-center justify-end gap-3 lg:col-span-1">
              <div className="hidden h-[3px] w-16 animate-pulse rounded-[1px] bg-muted lg:block" />
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
