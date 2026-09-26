"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CaseRef, PhaseRail, StatusTag } from "@/components/status";
import { ContactSheet, ProofPair } from "@/components/evidence";
import {
  ActionButton,
  Banner,
  EmptyState,
  LiveRegion,
} from "@/components/feedback";
import { CheckRow, FileDrop } from "@/components/form";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHECKS = [
  ["correctLocation", "The work was done at the reported location"],
  ["workPerformed", "The scope of work was actually performed"],
  ["beforeEvidence", "Before evidence is present and genuine"],
  ["afterEvidence", "After evidence shows the problem resolved"],
  ["requirementsMet", "The result meets the stated requirements"],
] as const;

type Checklist = Record<(typeof CHECKS)[number][0], boolean>;

const INITIAL: Checklist = {
  correctLocation: false,
  workPerformed: false,
  beforeEvidence: false,
  afterEvidence: false,
  requirementsMet: false,
};

export default function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workOrderId = id as Id<"workOrders">;
  const data = useQuery(api.inspections.getForWorkOrder, { workOrderId });
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  const beginInspection = useMutation(api.inspections.beginInspection);
  const decide = useMutation(api.inspections.decide);
  const generateUploadUrl = useMutation(api.evidence.generateUploadUrl);
  const attach = useMutation(api.evidence.attach);

  const [checklist, setChecklist] = useState<Checklist>(INITIAL);
  const [notes, setNotes] = useState("");
  const [confirmingPass, setConfirmingPass] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const started = useRef(false);

  const isInspector = me?.role === "inspector";
  const status = data?.workOrder?.status;

  // Opening a queued case claims the review, moving it into `inspection`.
  useEffect(() => {
    if (!isInspector || status !== "completion_submitted") return;
    if (started.current) return;
    started.current = true;
    void beginInspection({ workOrderId }).catch(() => {
      started.current = false;
    });
  }, [isInspector, status, workOrderId, beginInspection]);

  if (data === undefined) {
    return (
      <PageShell>
        <div className="space-y-6 pt-16">
          <div className="h-3 w-28 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-9 w-2/3 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-56 w-full animate-pulse rounded-[var(--radius)] bg-muted" />
        </div>
      </PageShell>
    );
  }

  if (!data?.issue || !data.workOrder) {
    return (
      <PageShell width="narrow">
        <div className="pt-16">
          <EmptyState
            title="Case not found"
            body="This inspection does not exist, or the ledger was reset."
            action={
              <Link href="/inspect" className={buttonVariants()}>
                Back to the queue
              </Link>
            }
          />
        </div>
      </PageShell>
    );
  }

  const issueId = data.issue._id;
  const kinds = new Set(data.evidence.map((e) => e.kind));
  const hasBefore = kinds.has("before");
  const hasAfter = kinds.has("after");
  const allChecked = Object.values(checklist).every(Boolean);
  const underReview = data.workOrder.status === "inspection";
  const decided = data.inspections.length > 0;
  const lastDecision = decided ? data.inspections[data.inspections.length - 1] : null;
  const decidedPass = lastDecision?.result === "pass";

  async function uploadInspectionPhoto(file: File | null) {
    if (!file) return;
    setBusy("photo");
    setNotice(null);
    try {
      const url = await generateUploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Try again.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attach({ issueId, storageId, kind: "inspection" });
      setNotice({ tone: "success", text: "Inspection photograph filed." });
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Upload failed. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function submit(result: "pass" | "fail") {
    setBusy(result);
    setNotice(null);
    try {
      await decide({
        workOrderId,
        result,
        checklist,
        notes: notes.trim() || undefined,
      });
      setConfirmingPass(false);
      setNotice({
        tone: "success",
        text:
          result === "pass"
            ? "Case passed and closed."
            : "Case returned to the contractor.",
      });
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Decision failed. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell width="wide">
      <div className="pt-6">
        <Link
          href="/inspect"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Inspection queue
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2.5">
            Inspection
            <CaseRef value={data.workOrder.caseNumber} />
          </span>
        }
        title={data.issue.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusTag status={data.workOrder.status} emphasis />
            <span>{data.issue.address}</span>
            {data.workOrder.contractorName && (
              <>
                <span aria-hidden>·</span>
                <span>filed by {data.workOrder.contractorName}</span>
              </>
            )}
          </span>
        }
      />

      <div className="border-t border-border py-6">
        <PhaseRail status={data.workOrder.status} />
      </div>

      {data.workOrder.status === "completion_submitted" && (
        <Section rule={false}>
          <Banner tone="info">
            {isInspector
              ? "Claiming this review. The case moves to inspection."
              : "Awaiting an inspector to claim this case."}
          </Banner>
        </Section>
      )}

      {/* The comparison is the decision. Given the most space on the page. */}
      <Section
        label="Before and after"
        aside={
          <span
            className={cn(
              "text-[0.6875rem] font-semibold tracking-[0.07em] uppercase",
              hasBefore && hasAfter ? "text-status-resolved" : "text-status-broken",
            )}
          >
            {hasBefore && hasAfter ? "Comparable" : "Not comparable"}
          </span>
        }
      >
        <div className="space-y-6">
          <ProofPair evidence={data.evidence} />
          {(!hasBefore || !hasAfter) && (
            <Banner tone="warning">
              <span className="flex flex-wrap items-center gap-1.5">
                <ShieldAlert className="size-3.5 shrink-0" />
                {[!hasBefore && "before", !hasAfter && "after"]
                  .filter(Boolean)
                  .join(" and ")}{" "}
                evidence is missing, so the completion cannot be verified. This
                case should be failed back to the contractor.
              </span>
            </Banner>
          )}
        </div>
      </Section>

      <Section label="Checklist">
        <div className="max-w-[62ch]">
          {CHECKS.map(([key, label]) => (
            <CheckRow
              key={key}
              checked={checklist[key]}
              disabled={!isInspector || !underReview}
              onChange={(next) =>
                setChecklist((c) => ({ ...c, [key]: next }))
              }
            >
              {label}
            </CheckRow>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Every item must pass to close a case. This is enforced on the server,
          not just here.
        </p>
      </Section>

      {underReview && isInspector && (
        <Section label="Inspection record">
          <div className="max-w-[62ch] space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="inspector-notes"
                className="text-[0.8125rem] font-medium"
              >
                Notes
              </label>
              <textarea
                id="inspector-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What you checked, and anything the contractor should know."
                className="w-full resize-y rounded-[var(--radius)] border border-input bg-card px-3 py-2 text-[0.9375rem] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
              />
              <p className="text-xs text-muted-foreground">
                Notes are required in practice when failing a case, and are
                published on the case file either way.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-[0.8125rem] font-medium">
                Inspection photograph
              </h3>
              <FileDrop
                id="inspection-photo"
                accept="image/*"
                capture="environment"
                disabled={busy === "photo"}
                onSelect={(f) => void uploadInspectionPhoto(f)}
                emptyLabel="Add a photo of the current state"
              />
            </div>

            {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
            <LiveRegion
              message={notice?.text}
              assertive={notice?.tone === "error"}
            />

            {/* Passing closes the case, so it is confirmed explicitly. */}
            <div className="border-t border-border pt-5">
              {confirmingPass ? (
                <div className="space-y-3">
                  <Banner tone="warning">
                    Passing closes this case publicly. It cannot be reopened —
                    the citizen would need to file a new report.
                  </Banner>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      pending={busy === "pass"}
                      pendingLabel="Closing case…"
                      onClick={() => void submit("pass")}
                    >
                      Confirm pass and close
                    </ActionButton>
                    <ActionButton
                      variant="outline"
                      onClick={() => setConfirmingPass(false)}
                    >
                      Cancel
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  <ActionButton
                    onClick={() => setConfirmingPass(true)}
                    disabled={!allChecked}
                    blockedReason={
                      allChecked
                        ? null
                        : "Tick every checklist item to enable a pass."
                    }
                  >
                    Pass and close case
                  </ActionButton>
                  <ActionButton
                    variant="destructive"
                    pending={busy === "fail"}
                    pendingLabel="Returning…"
                    onClick={() => void submit("fail")}
                    blockedReason={
                      notes.trim()
                        ? null
                        : "Add a note so the contractor knows what to fix."
                    }
                  >
                    Fail and return to contractor
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {decided && (
        <Section label="Decision on record">
          <div className="max-w-[62ch] space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={cn(
                  "text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
                  decidedPass ? "text-status-resolved" : "text-status-broken",
                )}
              >
                {lastDecision?.result === "pass" ? "Passed" : "Failed"}
              </span>
              <span className="font-mono text-[0.75rem] text-muted-foreground">
                {lastDecision &&
                  new Date(lastDecision.createdAt).toLocaleString(undefined, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
              </span>
            </div>
            {lastDecision?.notes && (
              <p className="text-[0.9375rem] leading-relaxed text-pretty">
                {lastDecision.notes}
              </p>
            )}
          </div>
        </Section>
      )}

      <Section label="All evidence">
        <ContactSheet evidence={data.evidence} />
      </Section>

      <div className="flex flex-wrap gap-2 border-t border-border pt-6">
        <Link
          href={`/issues/${issueId}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Open case file
        </Link>
        <Link
          href={`/work/${workOrderId}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Work order
        </Link>
      </div>
    </PageShell>
  );
}
