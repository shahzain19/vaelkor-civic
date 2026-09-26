"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  CaseRef,
  PhaseRail,
  StatusTag,
  categoryLabel,
} from "@/components/status";
import { Banner, EmptyState } from "@/components/feedback";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

export default function InspectionQueuePage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const queue = useQuery(api.inspections.listQueue);

  const canInspect = me?.role === "admin";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Inspection queue"
        description="Cases where a contractor has submitted completion. You decide whether the work is proved — a pass closes the case, a fail returns it."
      />

      {!canInspect && (
        <Section rule={false}>
          <Banner tone="warning">
            <span className="flex flex-wrap items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0" />
              {isAuthenticated
                ? `You are signed in as a ${me?.role ?? "guest"}. Inspection decisions are made by an administrator.`
                : "Sign in as an administrator to decide cases."}
              <Link
                href={isAuthenticated ? "/onboarding" : "/sign-in"}
                className="font-medium underline underline-offset-4"
              >
                {isAuthenticated ? "Change role" : "Sign in"}
              </Link>
            </span>
          </Banner>
        </Section>
      )}

      <Section label="Awaiting decision">
        {queue === undefined ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 border-b border-border pb-4">
                <div className="h-3 w-24 animate-pulse rounded-[3px] bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded-[3px] bg-muted" />
              </div>
            ))}
          </div>
        ) : queue.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            body="No cases are awaiting inspection. A case arrives here once the assigned contractor submits before and after photographs."
            icon={ClipboardCheck}
          />
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {queue.map((wo) => {
              // Decision support: can this case actually be passed?
              const kinds = new Set(wo.evidenceKinds ?? []);
              const hasBefore = kinds.has("before");
              const hasAfter = kinds.has("after");
              const decidable = hasBefore && hasAfter;

              return (
                <li key={wo._id}>
                  <Link
                    href={`/inspect/${wo._id}`}
                    className="flex flex-col gap-2.5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <CaseRef
                          value={wo.caseNumber}
                          className="text-muted-foreground"
                        />
                        <span
                          className={
                            decidable
                              ? "text-[0.6875rem] font-semibold tracking-[0.07em] text-status-resolved uppercase"
                              : "text-[0.6875rem] font-semibold tracking-[0.07em] text-status-broken uppercase"
                          }
                        >
                          {decidable ? "Proof complete" : "Proof incomplete"}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-[0.9375rem] leading-snug font-medium text-pretty">
                        {wo.issue?.title ?? "Work order"}
                      </h3>
                      <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                        {wo.issue ? `${categoryLabel(wo.issue.category)} · ` : ""}
                        {wo.issue?.address}
                        {wo.contractorName && ` · filed by ${wo.contractorName}`}
                      </p>
                      {!decidable && (
                        <p className="mt-1.5 text-xs text-status-broken">
                          Missing {[!hasBefore && "before", !hasAfter && "after"]
                            .filter(Boolean)
                            .join(" and ")}{" "}
                          evidence — expect to fail this one.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                      <PhaseRail status={wo.status} labels={false} />
                      <StatusTag status={wo.status} emphasis />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canInspect && queue && queue.length > 0 && (
        <Section label="How a decision is made">
          <ol className="max-w-[62ch] space-y-2.5 text-[0.9375rem] leading-relaxed">
            <li className="flex gap-3">
              <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">
                01
              </span>
              Compare the contractor&apos;s before and after photographs.
            </li>
            <li className="flex gap-3">
              <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">
                02
              </span>
              Check every item on the checklist. All must pass to close a case.
            </li>
            <li className="flex gap-3">
              <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">
                03
              </span>
              Pass to close, or fail to send it back to the contractor.
            </li>
          </ol>
        </Section>
      )}

      {canInspect && (
        <div className="pt-2">
          <Link href="/ledger" className={buttonVariants({ variant: "outline" })}>
            Back to the ledger
          </Link>
        </div>
      )}
    </PageShell>
  );
}
