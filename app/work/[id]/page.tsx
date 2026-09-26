"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CaseRef,
  PhaseRail,
  StatusTag,
  categoryLabel,
} from "@/components/status";
import { ContactSheet } from "@/components/evidence";
import { EmptyState } from "@/components/feedback";
import { Meta, MetaList, PageHeader, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workOrderId = id as Id<"workOrders">;
  const data = useQuery(api.workOrders.get, { workOrderId });

  if (data === undefined) {
    return (
      <PageShell>
        <div className="space-y-6 pt-16">
          <div className="h-3 w-24 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-9 w-2/3 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-[3px] bg-muted" />
        </div>
      </PageShell>
    );
  }

  if (data === null || !data.issue) {
    return (
      <PageShell width="narrow">
        <div className="pt-16">
          <EmptyState
            title="Work order not found"
            body="This work order does not exist, or the ledger was reset."
            action={
              <Link href="/ledger" className={buttonVariants()}>
                Back to the ledger
              </Link>
            }
          />
        </div>
      </PageShell>
    );
  }

  const { issue } = data;
  const awaitingDecision = ["completion_submitted", "inspection"].includes(
    data.status,
  );
  const executable =
    data.contractorId &&
    !["open", "closed", "completion_submitted", "inspection"].includes(
      data.status,
    );

  return (
    <PageShell>
      <div className="pt-6">
        <Link
          href={`/issues/${issue._id}`}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {issue.caseNumber}
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2.5">
            Work order
            <CaseRef value={data.caseNumber} />
          </span>
        }
        title={issue.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusTag status={data.status} emphasis />
            <span>{categoryLabel(issue.category)}</span>
            <span aria-hidden>·</span>
            <span>{issue.address}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {executable && (
              <Link
                href={`/contractor/work/${data._id}`}
                className={buttonVariants()}
              >
                Execution workspace
                <ArrowUpRight />
              </Link>
            )}
            {awaitingDecision && (
              <Link href={`/inspect/${data._id}`} className={buttonVariants()}>
                Review
                <ArrowUpRight />
              </Link>
            )}
            {data.status === "open" && (
              <Link href="/contractor" className={buttonVariants({ variant: "outline" })}>
                View work board
              </Link>
            )}
          </div>
        }
      />

      <div className="border-t border-border py-6">
        <PhaseRail status={data.status} />
      </div>

      <Section label="Scope of work">
        {data.scope.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scope items were generated for this category.
          </p>
        ) : (
          <ol className="max-w-[60ch] space-y-2">
            {data.scope.map((item, i) => (
              <li key={item} className="flex gap-3 text-[0.9375rem] leading-snug">
                <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        label="Evidence on file"
        aside={
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            {issue.confirmationCount} confirmations
          </span>
        }
      >
        <ContactSheet evidence={data.evidence} />
      </Section>

      <Section label="Record">
        <MetaList>
          <Meta label="Work order">{data.caseNumber}</Meta>
          <Meta label="Status">{data.status}</Meta>
          <Meta label="Priority">{data.priority}</Meta>
          <Meta label="Case">{issue.caseNumber}</Meta>
          <Meta label="Executor">
            {data.contractorName ?? "Unassigned"}
          </Meta>
          <Meta label="Opened">
            {new Date(data.createdAt).toLocaleDateString()}
          </Meta>
        </MetaList>
        <Link
          href={`/issues/${issue._id}`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-5",
          )}
        >
          Open the case file
          <ArrowUpRight />
        </Link>
      </Section>
    </PageShell>
  );
}
