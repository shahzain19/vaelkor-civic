"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ChevronDown, Inbox, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CaseRef,
  PhaseRail,
  PriorityTag,
  StatusTag,
  Tally,
  categoryLabel,
} from "@/components/status";
import { ActionButton, Banner, EmptyState } from "@/components/feedback";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ContractorBoardPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const available = useQuery(api.workOrders.listAvailable);
  const mine = useQuery(api.workOrders.listMine, isAuthenticated ? {} : "skip");

  const accept = useMutation(api.workOrders.accept);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const isContractor = me?.role === "contractor";

  // Highest priority first, then oldest — a queue that does not starve the
  // bottom of the list.
  const queue = useMemo(
    () =>
      [...(available ?? [])].sort(
        (a, b) =>
          (RANK[a.priority] ?? 3) - (RANK[b.priority] ?? 3) ||
          a.createdAt - b.createdAt,
      ),
    [available],
  );

  async function handleAccept(workOrderId: Id<"workOrders">) {
    setBusyId(workOrderId);
    setNotice(null);
    try {
      await accept({ workOrderId });
      setNotice({ tone: "success", text: "Work order accepted. It is now yours." });
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not accept. Try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Contractor"
        title="Work board"
        description="Open work orders in priority order. Read the scope before you accept — accepting assigns the job to you and lets you file execution evidence."
      />

      {!isAuthenticated ? (
        <Section rule>
          <EmptyState
            title="Sign in as a contractor"
            body="Work orders can only be accepted by a signed-in contractor account."
            action={
              <Link
                href="/sign-in"
                className="rounded-[var(--radius)] bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            }          />
        </Section>
      ) : !isContractor ? (
        <Section rule>
          <Banner tone="warning">
            <span className="flex flex-wrap items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0" />
              You are signed in as a {me?.role ?? "guest"}. Switch to the
              contractor role to accept work.
              <Link
                href="/onboarding"
                className="font-medium underline underline-offset-4"
              >
                Change role
              </Link>
            </span>
          </Banner>
        </Section>
      ) : null}

      {/* Assigned work first — this is what the contractor came to do. */}
      {mine && mine.length > 0 && (
        <Section label="Assigned to you" rule>
          <div className="divide-y divide-border border-y border-border">
            {mine.map((wo) => (
              <Link
                key={wo._id}
                href={`/contractor/work/${wo._id}`}
                className="flex flex-col gap-2 py-3.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <CaseRef value={wo.caseNumber} className="text-muted-foreground" />
                    <span className="truncate text-[0.9375rem] font-medium">
                      {wo.issue?.title ?? "Work order"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
                    {wo.issue?.address}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <PhaseRail status={wo.status} labels={false} />
                  <StatusTag status={wo.status} />
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        label="Open work orders"
        aside={
          available && (
            <span className="font-mono text-[0.75rem] text-muted-foreground">
              {queue.length}
            </span>
          )
        }
      >
        {available === undefined ? (
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
            title="Nothing on the board"
            body="Work orders appear here once a report has been confirmed by three independent citizens. There is nothing to accept right now."
            icon={Inbox}
          />
        ) : (
          <>
            {notice && (
              <Banner tone={notice.tone} className="mb-4">
                {notice.text}
              </Banner>
            )}
            <ul className="divide-y divide-border border-y border-border">
              {queue.map((wo) => {
                const open = expanded === wo._id;
                return (
                  <li key={wo._id} className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <CaseRef value={wo.caseNumber} className="text-muted-foreground" />
                          <PriorityTag priority={wo.priority} />
                          {wo.issue && (
                            <Tally count={wo.issue.confirmationCount} />
                          )}
                        </div>
                        <h3 className="mt-1.5 text-[0.9375rem] leading-snug font-medium text-pretty">
                          {wo.issue?.title ?? "Work order"}
                        </h3>
                        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                          {wo.issue ? `${categoryLabel(wo.issue.category)} · ` : ""}
                          {wo.issue?.address}
                        </p>
                      </div>
                      <StatusTag status={wo.status} emphasis className="self-start" />
                    </div>

                    {/* Scope is disclosed before accepting, not after. */}
                    {wo.scope.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : wo._id)}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              open && "rotate-180",
                            )}
                          />
                          {open ? "Hide" : "Review"} scope and evidence (
                          {wo.scope.length})
                        </button>

                        {open && (
                          <div className="mt-3 space-y-4 rounded-[var(--radius)] border border-border bg-muted/30 p-4">
                            <ol className="space-y-1.5">
                              {wo.scope.map((s, i) => (
                                <li key={s} className="flex gap-2.5 text-sm">
                                  <span className="mt-px shrink-0 font-mono text-xs text-muted-foreground">
                                    {String(i + 1).padStart(2, "0")}
                                  </span>
                                  {s}
                                </li>
                              ))}
                            </ol>
                            <div className="border-t border-border pt-3">
                              <h4 className="eyebrow mb-2">Evidence already on file</h4>
                              {wo.evidenceCount === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  None. You will need to file before and after
                                  photographs yourself.
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-mono text-foreground">
                                    {wo.evidenceCount}
                                  </span>{" "}
                                  item{wo.evidenceCount === 1 ? "" : "s"} (
                                  {wo.evidenceKinds.join(", ")}). Open the case to
                                  review the frames.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/work/${wo._id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "min-h-9 sm:min-h-0",
                        )}
                      >
                        View case
                      </Link>
                      <ActionButton
                        size="sm"
                        onClick={() => void handleAccept(wo._id)}
                        pending={busyId === wo._id}
                        pendingLabel="Accepting…"
                        disabled={!isContractor}
                        blockedReason={
                          isContractor
                            ? null
                            : "Sign in with the contractor role to accept."
                        }
                      >
                        Accept work order
                      </ActionButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>
    </PageShell>
  );
}
