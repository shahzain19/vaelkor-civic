"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowUpRight, Check, Lock, MapPin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CaseRef,
  PhaseRail,
  StatusTag,
  Tally,
  categoryLabel,
} from "@/components/status";
import { ContactSheet, ProofPair } from "@/components/evidence";
import { ActionButton, Banner, EmptyState, LiveRegion } from "@/components/feedback";
import { FundingSection } from "@/components/FundingSection";
import { Meta, MetaList, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { CONFIRMATION_THRESHOLD, FUND_GOALS, FUND_GOAL_DEFAULT, FUND_GOAL_MAX, formatCents, type Role } from "@/lib/civic";
import { formatCoord } from "@/lib/geo";
import { cn } from "@/lib/utils";

export default function CaseFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const issueId = id as Id<"issues">;

  const issue = useQuery(api.issues.get, { issueId });
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const confirm = useMutation(api.issues.confirm);
  const myClaim = useQuery(api.fund.getMyClaim, isAuthenticated ? { issueId } : "skip");


  const [busy, setBusy] = useState<null | "confirm" | "photo" | "adjustGoal">(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Derive claim status directly from the query result — no effect needed.
  const claimStatus = myClaim?.status ?? "none" as "none" | "pending" | "approved" | "rejected";
  const claimAmount = myClaim?.amountCents;

  if (issue === undefined) return <CaseSkeleton />;
  if (issue === null) {
    return (
      <PageShell width="narrow">
        <div className="pt-16">
          <EmptyState
            title="Case not found"
            body="This case does not exist, or it was removed when the ledger was reset."
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

  const alreadyConfirmed = issue.confirmations.some(
    (c) => c.userId === me?._id,
  );
  const remaining = Math.max(0, CONFIRMATION_THRESHOLD - issue.confirmationCount);
  const awaitingVerification =
    !issue.workOrderId && ["reported", "confirmed"].includes(issue.status);

  const canConfirm =
    me?.role === "citizen" && !alreadyConfirmed && awaitingVerification;

  async function run(kind: "confirm" | "photo", fn: () => Promise<void>) {
    setBusy(kind);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "That did not work. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell width="wide">
      <div className="pt-6">
        <Link
          href="/ledger"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Ledger
        </Link>
      </div>

      {/* Masthead */}
      <header className="flex flex-col gap-4 pt-5 pb-7 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <CaseRef value={issue.caseNumber} className="text-muted-foreground" />
            <StatusTag status={issue.status} emphasis />
            <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {categoryLabel(issue.category)}
            </span>
            {issue.severity === "high" && (
              <span className="text-[0.6875rem] font-semibold tracking-[0.08em] text-status-broken uppercase">
                High severity
              </span>
            )}
          </div>
          <h1 className="text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.022em] text-balance sm:text-[2.25rem]">
            {issue.title}
          </h1>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-muted-foreground">
            <span>Reported by {issue.reporterName}</span>
            <span aria-hidden>·</span>
            <time dateTime={new Date(issue.createdAt).toISOString()}>
              {new Date(issue.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </p>
        </div>
      </header>

      <div className="border-t border-border pt-5 pb-8">
        <PhaseRail status={issue.status} />
      </div>

      <div className="grid gap-x-6 gap-y-10 lg:gap-x-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Main column ─────────────────────────────────────────── */}
        <div className="min-w-0">
          <Section label="The report">
            <div className="max-w-[68ch] space-y-4">
              <p className="text-[0.9375rem] leading-relaxed text-pretty">
                {issue.description}
              </p>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                  {issue.address}
                </span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${issue.lat}&mlon=${issue.lng}#map=17/${issue.lat}/${issue.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[0.8125rem] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {formatCoord(issue.lat, issue.lng)}
                  <ArrowUpRight className="size-3" />
                </a>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Coordinates are an approximate area. Device locations are offset
                before storage so a public case cannot be traced back to a
                reporter&apos;s home.
              </p>
            </div>
          </Section>

          <Section
            label="Proof"
            aside={
              <span className="font-mono text-[0.75rem] text-muted-foreground">
                {issue.evidenceCount} item{issue.evidenceCount === 1 ? "" : "s"}
              </span>
            }
          >
            <div className="space-y-8">
              <ProofPair evidence={issue.evidence} />
              <ContactSheet evidence={issue.evidence} />
            </div>
          </Section>

          <Section label="Chain of custody">
            <ol className="relative space-y-0">
              {issue.activity.map((log, i) => (
                <li
                  key={log._id}
                  className="relative grid grid-cols-[auto_1fr] gap-x-4 pb-5 last:pb-0"
                >
                  {/* Hairline spine with a node per event. */}
                  <div className="relative flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        i === issue.activity.length - 1
                          ? "bg-foreground"
                          : "bg-border",
                      )}
                      aria-hidden
                    />
                    {i < issue.activity.length - 1 && (
                      <span
                        className="mt-1 w-px flex-1 bg-border"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="font-mono text-[0.6875rem] tracking-tight text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {log.actorName && (
                        <span className="text-[0.8125rem] text-foreground">
                          {log.actorName}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[0.9375rem] leading-snug text-pretty">
                      {log.message}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* ── Action rail ─────────────────────────────────────────── */}
        <aside className="min-w-0 lg:sticky lg:top-[4.75rem] lg:self-start">
          <div className="space-y-8 lg:pt-0">
            {/* The one thing this viewer can do next, and why. */}
            <div className="rounded-[var(--radius)] border border-border bg-card p-4">
              <h2 className="eyebrow">Your move</h2>
              <div className="mt-3">
                <NextAction
                  me={me}
                  isAuthenticated={isAuthenticated}
                  issue={issue}
                  alreadyConfirmed={alreadyConfirmed}
                  canConfirm={canConfirm}
                  awaitingVerification={awaitingVerification}
                  remaining={remaining}
                  busy={busy === "confirm"}
                  onConfirm={() =>
                    void run("confirm", async () => {
                      await confirm({ issueId });
                      setNotice({
                        tone: "success",
                        text: "Confirmation recorded. Thank you.",
                      });
                    })
                  }
                />
              </div>
            </div>

            {notice && (
              <Banner tone={notice.tone}>{notice.text}</Banner>
            )}
            <LiveRegion message={notice?.text} assertive={notice?.tone === "error"} />

            {/* Verification gate. */}
            <div>
              <h2 className="eyebrow">Verification</h2>
              <div className="mt-3 rounded-[var(--radius)] border border-border p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Tally count={issue.confirmationCount} showCount={false} />
                  <span className="font-mono text-[0.8125rem]">
                    {issue.confirmationCount}/{CONFIRMATION_THRESHOLD}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {issue.workOrderId
                    ? "Threshold reached. A work order is open."
                    : `${remaining} more independent confirmation${remaining === 1 ? "" : "s"} opens a work order.`}
                </p>
                {issue.confirmations.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-border pt-2.5">
                    {issue.confirmations.map((c) => (
                      <li
                        key={c._id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="truncate">{c.userName}</span>
                        <span className="shrink-0 text-muted-foreground capitalize">
                          {c.userRole ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Funding section, only when there's a work order. */}
            {issue.workOrderId && (
              <div className="rounded-[var(--radius)] border border-border bg-card p-4 mt-4">
                <h2 className="eyebrow mb-3">Fund this work</h2>
                <FundingSection
                  issueId={issueId}
                  goalCents={issue.fundGoal?.targetCents ?? FUND_GOALS[issue.category] ?? FUND_GOAL_DEFAULT}
                  myClaimStatus={claimStatus}
                  myClaimAmount={claimAmount}
                  onSuccess={() => {
                    setNotice({ tone: "success", text: "Your claim has been submitted. It will be reviewed by an administrator." });
                  }}
                />
                {me?.role === "admin" && issue.fundGoal && (
                  <AdminGoalAdjust
                    issueId={issueId}
                    currentGoalCents={issue.fundGoal.targetCents}
                    onAdjusted={(newCents) => setNotice({ tone: "success", text: `Goal updated to ${formatCents(newCents)}.` })}
                  />
                )}
              </div>
            )}

            <MetaList label="Record">
              <Meta label="Case">{issue.caseNumber}</Meta>
              <Meta label="Type">{categoryLabel(issue.category)}</Meta>
              <Meta label="Severity">{issue.severity}</Meta>
              <Meta label="Reporter">{issue.reporterName}</Meta>
              <Meta label="Confirmations">
                {issue.confirmationCount} of {CONFIRMATION_THRESHOLD}
              </Meta>
              <Meta label="Evidence">{issue.evidenceCount}</Meta>
              <Meta label="Position">
                {formatCoord(issue.lat, issue.lng)}
              </Meta>
            </MetaList>

            {issue.workOrder && (
              <div>
                <h2 className="eyebrow mb-3">Work order</h2>
                <div className="rounded-[var(--radius)] border border-border p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <CaseRef value={issue.workOrder.caseNumber} />
                    <StatusTag status={issue.workOrder.status} />
                  </div>
                  {issue.workOrder.contractorId && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Assigned to a contractor
                    </p>
                  )}
                  <Link
                    href={`/work/${issue.workOrder._id}`}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "mt-3 w-full",
                    )}
                  >
                    Open work order
                    <ArrowUpRight />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

/* ── Next action ─────────────────────────────────────────────────────── */

type Me = {
  _id: string;
  role?: Role;
  name?: string;
} | null | undefined;

/**
 * The single most useful sentence on the page: what this viewer can do next,
 * and — when they cannot — exactly why.
 */
function NextAction({
  me,
  isAuthenticated,
  issue,
  alreadyConfirmed,
  canConfirm,
  awaitingVerification,
  remaining,
  busy,
  onConfirm,
}: {
  me: Me;
  isAuthenticated: boolean;
  issue: {
    status: string;
    workOrder: { _id: string; status: string; contractorId?: string } | null;
  };
  alreadyConfirmed: boolean;
  canConfirm: boolean;
  awaitingVerification: boolean;
  remaining: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="space-y-3">
        <p className="text-[0.9375rem] leading-relaxed text-pretty">
          Sign in to confirm this problem. One confirmation per person.
        </p>
        <Link href="/sign-in" className={cn(buttonVariants(), "w-full")}>
          Sign in to confirm
        </Link>
      </div>
    );
  }

  if (!me?.role) {
    return (
      <div className="space-y-3">
        <p className="text-[0.9375rem] leading-relaxed text-pretty">
          Choose how you take part in the ledger.
        </p>
        <Link href="/onboarding" className={cn(buttonVariants(), "w-full")}>
          Choose a role
        </Link>
      </div>
    );
  }

  if (me.role === "citizen") {
    if (!awaitingVerification) {
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <Check className="size-4 text-status-resolved" />
            Verification complete
          </p>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
            Confirmations are closed. Progress is tracked on the work order.
          </p>
          {issue.workOrder && (
            <Link
              href={`/work/${issue.workOrder._id}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-full")}
            >
              Follow the work order
            </Link>
          )}
        </div>
      );
    }
    if (alreadyConfirmed) {
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <Check className="size-4 text-status-resolved" />
            You confirmed this
          </p>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
            {remaining === 0
              ? "A work order is being opened."
              : `Waiting on ${remaining} more independent confirmation${remaining === 1 ? "" : "s"} from other people.`}
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-[0.9375rem] leading-relaxed text-pretty">
          Seen this problem? Confirming it helps a work order open.
        </p>
        <ActionButton
          onClick={onConfirm}
          pending={busy}
          pendingLabel="Recording…"
          className="w-full"
          blockedReason={
            !canConfirm ? "Confirmations are closed for this case." : null
          }
        >
          Confirm this problem
        </ActionButton>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {remaining} more opens a work order. One confirmation per person.
        </p>
      </div>
    );
  }

  if (me.role === "contractor") {
    if (!issue.workOrder) {
      return (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <Lock className="size-4 text-muted-foreground" />
            Not yet on the board
          </p>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
            A work order opens once {CONFIRMATION_THRESHOLD} people confirm the
            report.
          </p>
        </div>
      );
    }
    if (issue.workOrder.contractorId === me._id) {
      return (
        <div className="space-y-3">
          <p className="text-[0.9375rem] leading-relaxed text-pretty">
            This job is assigned to you.
          </p>
          <Link
            href={`/contractor/work/${issue.workOrder._id}`}
            className={cn(buttonVariants(), "w-full")}
          >
            Open execution workspace
          </Link>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Before and after photographs are required to submit completion.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
          <Lock className="size-4 text-muted-foreground" />
          Assigned elsewhere
        </p>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          Only the assigned contractor can file execution evidence.
        </p>
      </div>
    );
  }

  // Inspector
  if (["completion_submitted", "inspection"].includes(issue.status)) {
    return (
      <div className="space-y-3">
        <p className="text-[0.9375rem] leading-relaxed text-pretty">
          Completion is submitted and awaiting your decision.
        </p>
        {issue.workOrder && (
          <Link
            href={`/inspect/${issue.workOrder._id}`}
            className={cn(buttonVariants(), "w-full")}
          >
            Review and decide
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
        <Lock className="size-4 text-muted-foreground" />
        Not awaiting inspection
      </p>
      <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
        Cases reach the inspection queue once a contractor submits completion.
      </p>
    </div>
  );
}

function CaseSkeleton() {
  return (
    <PageShell width="wide">
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8 pt-16">
          <div className="h-3 w-28 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-9 w-3/4 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-[3px] bg-muted" />
          <div className="h-64 w-full animate-pulse rounded-[var(--radius)] bg-muted" />
        </div>
        <div className="space-y-6 pt-16">
          <div className="h-32 w-full animate-pulse rounded-[var(--radius)] bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-[var(--radius)] bg-muted" />
        </div>
      </div>
    </PageShell>
  );
}

/* ── Admin goal adjustment ─────────────────────────────────────────────────── */

function AdminGoalAdjust({
  issueId,
  currentGoalCents,
  onAdjusted,
}: {
  issueId: string;
  currentGoalCents: number;
  onAdjusted: (newCents: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustGoalMutation = useMutation(api.fund.adjustGoal);
  const typedIssueId = issueId as Id<"issues">;

  async function handleAdjust() {
    const cents = Math.round(parseFloat(newAmount) * 100);
    if (isNaN(cents) || cents < 100) {
      setError("Enter a valid amount (minimum PKR 1).");
      return;
    }
    if (cents > FUND_GOAL_MAX) {
      setError(`Maximum goal is PKR ${formatCents(FUND_GOAL_MAX)}.`);
      return;
    }

    setPending(true);
    setError(null);
    try {
      await adjustGoalMutation({ issueId: typedIssueId, targetCents: cents, note: note.trim() || undefined });
      setNewAmount("");
      setNote("");
      setOpen(false);
      onAdjusted(cents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not adjust goal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[0.8125rem] font-medium text-foreground hover:underline"
        >
          Admin: Adjust fund goal
        </button>
      ) : (
        <div className="space-y-3 rounded-[var(--radius)] border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] text-muted-foreground">
              Current: <span className="font-mono text-foreground">{formatCents(currentGoalCents)}</span>
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <div>
              <label htmlFor={`goal-${issueId}`} className="text-[0.75rem] text-muted-foreground">
                New goal (PKR)
              </label>
              <input
                id={`goal-${issueId}`}
                type="number"
                step="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="e.g. 5.00"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor={`note-${issueId}`} className="text-[0.75rem] text-muted-foreground">
                Reason (optional)
              </label>
              <input
                id={`note-${issueId}`}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why the change?"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAdjust()}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {pending ? "Updating…" : "Update goal"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
