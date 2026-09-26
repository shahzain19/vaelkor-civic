"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CaseRef, PhaseRail, StatusTag } from "@/components/status";
import { ContactSheet, type EvidenceItem } from "@/components/evidence";
import {
  ActionButton,
  Banner,
  EmptyState,
  LiveRegion,
} from "@/components/feedback";
import { FileDrop } from "@/components/form";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";

const REQUIRED: ("before" | "after")[] = ["before", "after"];
const SLOTS = [
  { kind: "before", label: "Before", blurb: "Site condition before you start." },
  { kind: "during", label: "During", blurb: "Work in progress." },
  { kind: "after", label: "After", blurb: "Site condition on completion." },
] as const;

export default function ExecutionWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const workOrderId = id as Id<"workOrders">;
  const data = useQuery(api.workOrders.get, { workOrderId });
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  const start = useMutation(api.workOrders.start);
  const submitCompletion = useMutation(api.workOrders.submitCompletion);
  const generateUploadUrl = useMutation(api.evidence.generateUploadUrl);
  const attach = useMutation(api.evidence.attach);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [uploads, setUploads] = useState<Record<string, string | null>>({});

  if (data === undefined) {
    return (
      <PageShell>
        <div className="space-y-6 pt-16">
          <div className="h-3 w-28 animate-pulse rounded-[3px] bg-muted" />
          <div className="h-9 w-2/3 animate-pulse rounded-[3px] bg-muted" />
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
            body="This job does not exist, or the ledger was reset."
            action={
              <Link href="/contractor" className={buttonVariants()}>
                Back to the work board
              </Link>
            }
          />
        </div>
      </PageShell>
    );
  }

  const mineId = me?._id;
  const mine = me?.role === "contractor" && data.contractorId === me._id;
  const issueId = data.issue._id;
  const canWork = mine && ["claimed", "in_progress"].includes(data.status);

  // Only the assigned contractor's own uploads count — the server enforces the
  // same rule, so the UI must not imply otherwise.
  const ownKinds = new Set(
    data.evidence.filter((e) => e.userId === mineId).map((e) => e.kind),
  );
  const missing = REQUIRED.filter((k) => !ownKinds.has(k));

  async function upload(slot: string, file: File | null) {
    if (!file) return;
    setBusy(slot);
    setNotice(null);
    try {
      const url = await generateUploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Check your connection and retry.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await attach({
        issueId,
        storageId,
        kind: slot as "before" | "during" | "after",
      });
      setUploads((u) => ({ ...u, [slot]: file.name }));
      setNotice({ tone: "success", text: `${slot} photograph filed.` });
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Upload failed. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: "start" | "submit", fn: () => Promise<string>) {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ tone: "success", text: await fn() });
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
    <PageShell>
      <div className="pt-6">
        <Link
          href="/contractor"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Work board
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2.5">
            Execution
            <CaseRef value={data.caseNumber} />
          </span>
        }
        title={data.issue.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusTag status={data.status} emphasis />
            <span>{data.issue.address}</span>
          </span>
        }
      />

      <div className="border-t border-border py-6">
        <PhaseRail status={data.status} />
      </div>

      <Section label="Scope of work">
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
      </Section>

      {me?.role !== "contractor" && (
        <Section rule>
          <Banner tone="warning">
            <span className="flex flex-wrap items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0" />
              Only the assigned contractor can file execution evidence.
              {me?.role ? (
                <Link
                  href="/onboarding"
                  className="font-medium underline underline-offset-4"
                >
                  Switch role
                </Link>
              ) : (
                <Link href="/sign-in" className="font-medium underline underline-offset-4">
                  Sign in
                </Link>
              )}
            </span>
          </Banner>
        </Section>
      )}

      {data.contractorId && !mine && me?.role === "contractor" && (
        <Section rule>
          <Banner tone="info">
            This job is assigned to another contractor. You can read it, but
            execution evidence must come from the assigned executor.
          </Banner>
        </Section>
      )}

      {canWork && (
        <Section
          label="Execution evidence"
          aside={
            <span className="font-mono text-[0.75rem] text-muted-foreground">
              {missing.length === 0
                ? "complete"
                : `${missing.length} required left`}
            </span>
          }
        >
          <div className="max-w-[68ch] space-y-5">
            <p className="text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
              An inspector decides this case by comparing your before and after
              photographs. Before and after are required; during is optional.
            </p>

            <div className="space-y-3">
              {SLOTS.map((slot) => {
                const required = REQUIRED.includes(slot.kind as "before" | "after");
                const filed = ownKinds.has(slot.kind);
                return (
                  <div
                    key={slot.kind}
                    className="rounded-[var(--radius)] border border-border p-3.5"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.6875rem] leading-none font-semibold tracking-[0.09em] uppercase">
                            {slot.label}
                          </span>
                          {required && (
                            <span className="text-[0.6875rem] text-muted-foreground">
                              required
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {slot.blurb}
                        </p>
                      </div>
                      {filed && (
                        <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold tracking-[0.07em] text-status-resolved uppercase">
                          <Check className="size-3" />
                          Filed
                        </span>
                      )}
                    </div>
                    <FileDrop
                      id={`slot-${slot.kind}`}
                      accept="image/*"
                      capture="environment"
                      disabled={busy === slot.kind}
                      onSelect={(f) => void upload(slot.kind, f)}
                      fileName={uploads[slot.kind] ?? (filed ? "Filed — add another" : null)}
                      emptyLabel={filed ? "Add another" : `Add ${slot.label.toLowerCase()} photo`}
                    />
                  </div>
                );
              })}
            </div>

            {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}
            <LiveRegion
              message={notice?.text}
              assertive={notice?.tone === "error"}
            />

            <div className="flex flex-wrap items-start gap-2 border-t border-border pt-5">
              {data.status === "claimed" && (
                <ActionButton
                  variant="outline"
                  pending={busy === "start"}
                  pendingLabel="Starting…"
                  onClick={() =>
                    void act("start", async () => {
                      await start({ workOrderId });
                      return "Work marked in progress.";
                    })
                  }
                >
                  Mark work in progress
                </ActionButton>
              )}
              <ActionButton
                pending={busy === "submit"}
                pendingLabel="Submitting…"
                onClick={() =>
                  void act("submit", async () => {
                    await submitCompletion({ workOrderId });
                    return "Completion submitted. It is now in the inspection queue.";
                  })
                }
                blockedReason={
                  missing.length > 0
                    ? `Upload your own ${missing.join(" and ")} ${
                        missing.length === 1 ? "photograph" : "photographs"
                      } first — an inspector compares them to decide.`
                    : null
                }
              >
                Submit for inspection
              </ActionButton>
            </div>
          </div>
        </Section>
      )}

      <Section
        label="Evidence on file"
        aside={
          <span className="font-mono text-[0.75rem] text-muted-foreground">
            {data.evidence.length}
          </span>
        }
      >
        <ContactSheet evidence={data.evidence as EvidenceItem[]} />
      </Section>
    </PageShell>
  );
}
