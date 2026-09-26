"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, CheckCircle, Clock, DollarSign, Image as ImageIcon, ShieldAlert, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { Banner, EmptyState, Skeleton } from "@/components/feedback";
import { CaseRef, StatusTag, categoryLabel } from "@/components/status";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/civic";
import type { Id } from "@/convex/_generated/dataModel";

interface PendingClaim {
  _id: Id<"fundClaims">;
  _creationTime: number;
  issueId: Id<"issues">;
  userId: Id<"users">;
  amountCents: number;
  paymentMethod: string;
  screenshotStorageId: Id<"_storage">;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  issueCaseNumber: string | null;
  issueTitle: string | null;
  issueCategory: string | null;
  issueStatus: string | null;
  workOrderStatus: string | null;
  claimantName: string;
  claimantRole: string | null;
  screenshotUrl: string | null;
}

export default function AdminFundClaimsPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const isAdmin = me?.role === "admin";
  const claims = useQuery(api.fund.listPendingClaims, isAdmin ? {} : "skip");
  const [selectedClaim, setSelectedClaim] = useState<PendingClaim | null>(null);
  const [note, setNote] = useState("");
  const [actionPending, setActionPending] = useState(false);

  const approve = useMutation(api.fund.approveClaim);
  const reject = useMutation(api.fund.rejectClaim);

  async function handleApprove() {
    if (!selectedClaim) return;
    setActionPending(true);
    try {
      await approve({ claimId: selectedClaim._id, note: note.trim() || undefined });
      setSelectedClaim(null);
      setNote("");
    } finally {
      setActionPending(false);
    }
  }

  async function handleReject() {
    if (!selectedClaim) return;
    if (!note.trim()) return;
    setActionPending(true);
    try {
      await reject({ claimId: selectedClaim._id, note: note.trim() });
      setSelectedClaim(null);
      setNote("");
    } finally {
      setActionPending(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <PageShell>
        <PageHeader eyebrow="Administration" title="Fund claims" />
        <Section rule>
          <EmptyState
            title="Sign in to continue"
            body="Fund claim oversight is only visible to signed-in administrators."
            icon={ShieldAlert}
            action={
              <Link href="/sign-in" className={cn(buttonVariants({ size: "sm" }), "min-h-9 sm:min-h-0")}>
                Sign in
              </Link>
            }
          />
        </Section>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell>
        <PageHeader eyebrow="Administration" title="Fund claims" />
        <Section rule>
          <Banner tone="warning">
            <span className="flex flex-wrap items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0" />
              This area is for administrators. You are signed in as a{" "}
              {me?.role ?? "guest"}.
            </span>
          </Banner>
        </Section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="pt-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to admin
        </Link>
      </div>

      <PageHeader
        eyebrow="Administration"
        title="Fund claims"
        description="Review and approve citizen payment claims. Each claim includes a payment screenshot — verify the amount matches and the transfer is genuine before approving."
        actions={
          claims && claims.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
              <Clock className="size-3" />
              {claims.length} pending
            </span>
          )
        }
      />

      <Section label={`Pending claims${claims && claims.length > 0 ? ` (${claims.length})` : ""}`}>
        {claims === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            title="All caught up"
            body="No pending claims. Every submitted payment has been reviewed."
            icon={CheckCircle}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {claims.map((claim) => (
              <ClaimCard
                key={claim._id}
                claim={claim}
                isSelected={selectedClaim?._id === claim._id}
                onSelect={() => {
                  setSelectedClaim(claim);
                  setNote("");
                }}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Detail panel for selected claim */}
      {selectedClaim && (
        <Section label="Review claim">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Screenshot */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Payment screenshot</h3>
              {selectedClaim.screenshotUrl ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <img
                    src={selectedClaim.screenshotUrl}
                    alt="Payment proof"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border flex h-48 items-center justify-center">
                  <span className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageIcon className="size-6" />
                    <span className="text-sm">No screenshot available</span>
                  </span>
                </div>
              )}
            </div>

            {/* Claim details */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CaseRef value={selectedClaim.issueCaseNumber ?? ""} />
                  <StatusTag status={selectedClaim.issueStatus ?? "unknown"} />
                </div>
                <h4 className="font-medium">{selectedClaim.issueTitle}</h4>
                <p className="text-sm text-muted-foreground">
                  {categoryLabel(selectedClaim.issueCategory ?? "road")}
                </p>
              </div>

              <div className="rounded-md border border-border p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-mono font-medium">PKR {formatCents(selectedClaim.amountCents)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Method</span>
                  <span className="font-medium capitalize">{selectedClaim.paymentMethod.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Claimant</span>
                  <span className="font-medium">{selectedClaim.claimantName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="text-muted-foreground">
                    {new Date(selectedClaim.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="admin-note" className="text-sm font-medium">
                  Admin note <span className="text-muted-foreground">(optional for approve, required for reject)</span>
                </label>
                <textarea
                  id="admin-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for the record…"
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleApprove()}
                  disabled={actionPending}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "bg-green-600 hover:bg-green-700 text-white",
                  )}
                >
                  <CheckCircle className="size-4 mr-2" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void handleReject()}
                  disabled={actionPending || !note.trim()}
                  className={cn(
                    buttonVariants({ size: "lg", variant: "outline" }),
                    "text-red-600 hover:text-red-700 hover:border-red-300",
                  )}
                >
                  <XCircle className="size-4 mr-2" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedClaim(null); setNote(""); }}
                  className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "ml-auto")}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Section>
      )}
    </PageShell>
  );
}

/* ── Claim card ─────────────────────────────────────────────────────────────── */

function ClaimCard({
  claim,
  isSelected,
  onSelect,
}: {
  claim: PendingClaim;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-[var(--radius)] border p-4 transition-colors hover:bg-muted/30",
        isSelected ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CaseRef value={claim.issueCaseNumber ?? ""} />
            <StatusTag status={claim.issueStatus ?? "unknown"} />
          </div>
          <h3 className="mt-1 text-[0.9375rem] font-medium truncate">{claim.issueTitle}</h3>
          <p className="text-xs text-muted-foreground">
            {categoryLabel(claim.issueCategory ?? "road")} · {claim.claimantName}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono text-lg font-medium">PKR {formatCents(claim.amountCents)}</p>
          <p className="text-xs text-muted-foreground capitalize">{claim.paymentMethod.replace("_", " ")}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="size-3" />
        <span>{new Date(claim.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
        <span aria-hidden>·</span>
        {claim.screenshotUrl && (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3" />
            Screenshot attached
          </span>
        )}
      </div>
    </button>
  );
}
