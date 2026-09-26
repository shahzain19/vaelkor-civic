"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { DollarSign, LifeBuoy, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { MAX_GRANT, type EscalatedCase } from "@/convex/oversight";
import type { SeriesPoint } from "@/convex/analytics";
import { PageHeader, PageShell, Section } from "@/components/shell";
import {
  ActionButton,
  Banner,
  EmptyState,
  LiveRegion,
  Skeleton,
} from "@/components/feedback";
import { CaseRef, PriorityTag, StatusTag, categoryLabel } from "@/components/status";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The administrator's queue: cases that cannot move on their own.
 *
 * An administrator can do exactly one thing here — let a stuck case have
 * another inspection attempt. Everything else on a case still belongs to the
 * people doing the work, which is why this page has no close button, no edit
 * control, and no way to move a case backwards. The one action it does have is
 * attributed and written onto the case history.
 */
export default function AdminOversightPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const isAdmin = me?.role === "admin";
  const queue = useQuery(api.oversight.escalatedCases, isAdmin ? {} : "skip");
  const [view, setView] = useState<"queue" | "reporting">("queue");

  if (!isAuthenticated) {
    return (
      <PageShell>
        <PageHeader eyebrow="Administration" title="Case oversight" />
        <Section rule>
          <EmptyState
            title="Sign in to continue"
            body="The escalation queue is only visible to signed-in administrators."
            icon={LifeBuoy}
            action={
              <Link
                href="/sign-in"
                className={cn(buttonVariants({ size: "sm" }), "min-h-9 sm:min-h-0")}
              >
                Sign in
              </Link>
            }
          />
        </Section>
      </PageShell>
    );
  }

  // No link to /onboarding here, unlike the civic pages. The admin role is not
  // on the self-select list, so telling a non-administrator to go and change
  // their role would send them somewhere that cannot help them.
  if (!isAdmin) {
    return (
      <PageShell>
        <PageHeader eyebrow="Administration" title="Case oversight" />
        <Section rule>
          <Banner tone="warning">
            <span className="flex flex-wrap items-center gap-1.5">
              <ShieldAlert className="size-3.5 shrink-0" />
              This area is for administrators. You are signed in as a{" "}
              {me?.role ?? "guest"}, who can file and follow cases but cannot
              change the inspection budget.
            </span>
          </Banner>
        </Section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Administration"
        title="Case oversight"
        description="Cases that have spent every inspection attempt, and reporting on the ledger as a whole. Allowing another attempt is the only decision available here — it is recorded against your name on the case history."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/fund-claims"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-9 sm:min-h-0",
              )}
            >
              <DollarSign className="size-3.5" />
              Fund claims
            </Link>
            <button
              type="button"
              onClick={() => setView((v) => (v === "queue" ? "reporting" : "queue"))}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-9 sm:min-h-0",
              )}
            >
              {view === "queue" ? "View reporting" : "View escalations"}
            </button>
          </div>
        }
      />

      {view === "queue" ? (
        <Section
          label="Waiting on an administrator"
          aside={
            queue && (
              <span className="font-mono text-[0.75rem] text-muted-foreground">
                {queue.length}
              </span>
            )
          }
        >
          {queue === undefined ? (
            <div
              className="space-y-3"
              role="status"
              aria-label="Loading the queue"
            >
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2 border-b border-border pb-4">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : queue.length === 0 ? (
            <EmptyState
              title="Nothing is waiting"
              body="Every case either has inspection attempts left or has been resolved. Cases appear here on their own when they run out."
              icon={LifeBuoy}
            />
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {queue.map((row) => (
                <QueueRow key={row.issueId} row={row} />
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <Reporting />
      )}
    </PageShell>
  );
}


/**
 * One stuck case and the single decision available on it.
 *
 * The reason field is optional server-side but the form asks for it anyway: a
 * grant with no stated reason is indistinguishable from an arbitrary click, and
 * the reporter reads this text.
 */
function QueueRow({ row }: { row: EscalatedCase }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState("1");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const grant = useMutation(api.oversight.grantBudget);
  const count = Number(attempts);
  const noteError =
    note.trim().length > 0 && note.trim().length < 3
      ? "Give at least a few words."
      : null;

  const stuck = row.failures >= row.allowance;
  const granted = row.granted > 0;

  async function handleGrant() {
    setPending(true);
    setNotice(null);
    try {
      const result = await grant({
        issueId: row.issueId,
        attempts: count,
        note: note.trim() || undefined,
      });
      setNotice({
        tone: "success",
        text: `Allowed ${count} more attempt${count === 1 ? "" : "s"}. This case now has ${result.allowance}.`,
      });
      setOpen(false);
      setNote("");
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not allow another attempt.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CaseRef value={row.caseNumber} className="text-muted-foreground" />
            <PriorityTag priority={row.severity} />
            <span className="font-mono text-[0.75rem] text-muted-foreground">
              {row.failures} failed / {row.allowance} allowed
            </span>
          </div>
          <h3 className="mt-1.5 text-[0.9375rem] leading-snug font-medium text-pretty">
            {row.title}
          </h3>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            {categoryLabel(row.category)}
          </p>
        </div>
        <StatusTag status={row.status} emphasis className="self-start" />
      </div>

      {granted && row.lastGrant && (
        <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          Last extended by{" "}
          <span className="font-mono text-foreground">
            {row.lastGrant.attempts}
          </span>{" "}
          attempt{row.lastGrant.attempts === 1 ? "" : "s"} on{" "}
          {new Date(row.lastGrant.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {row.lastGrant.note ? ` — “${row.lastGrant.note}”` : ""}.
        </p>
      )}

      <LiveRegion message={notice?.text} />
      {notice?.tone === "error" && (
        <Banner tone="error" className="mt-3">
          {notice.text}
        </Banner>
      )}

      <div className="mt-3.5">
        {!open ? (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              size="sm"
              onClick={() => setOpen(true)}
              disabled={!stuck}
              blockedReason={
                stuck
                  ? null
                  : "An administrator has already allowed more attempts."
              }
            >
              Allow another attempt
            </ActionButton>
            <Link
              href={`/issues/${row.issueId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-9 sm:min-h-0",
              )}
            >
              View case
            </Link>
          </div>
        ) : (
          <div className="space-y-3 rounded-[var(--radius)] border border-border bg-muted/30 p-4">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={`attempts-${row.issueId}`}>Attempts</Label>
                <Select
                  value={attempts}
                  onValueChange={(v) => setAttempts(v ?? "1")}
                >
                  <SelectTrigger
                    id={`attempts-${row.issueId}`}
                    className="min-h-9 sm:min-h-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: MAX_GRANT }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} more
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`note-${row.issueId}`}>
                  Reason for the record
                </Label>
                <Textarea
                  id={`note-${row.issueId}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Shown to the reporter on the case history."
                  rows={2}
                  aria-invalid={noteError ? true : undefined}
                />
                {noteError && (
                  <p className="text-[0.75rem] text-destructive">{noteError}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                size="sm"
                onClick={() => void handleGrant()}
                pending={pending}
                pendingLabel="Recording…"
                disabled={!Number.isInteger(count) || count < 1 || Boolean(noteError)}
                blockedReason={
                  !Number.isInteger(count) || count < 1
                    ? "Choose how many attempts to allow."
                    : noteError
                }
              >
                Allow {count} more attempt{count === 1 ? "" : "s"}
              </ActionButton>
              <ActionButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </ActionButton>
            </div>

            <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
              This does not close the case or judge the inspection. It only lets
              an inspector try again.
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

/* Reporting ---------------------------------------------------------------- */

/**
 * The reporting view.
 *
 * Every figure is a count or a duration over the whole ledger, and the page
 * says so — a dashboard that quietly exposed per-person numbers would invite the
 * reader to treat those as the point. The two measures that are not simple
 * counts are shown as "No data" rather than as zero, because an empty ledger is
 * not a fast one.
 */
function Reporting() {
  const overview = useQuery(api.analytics.overview, {});
  const categories = useQuery(api.analytics.byCategory, {});
  const severities = useQuery(api.analytics.bySeverity, {});
  const weekly = useQuery(api.analytics.weekly, {});
  const inspection = useQuery(api.analytics.inspections, {});
  const spread = useQuery(api.analytics.statusSpread, {});

  if (
    !overview ||
    !categories ||
    !severities ||
    !weekly ||
    !inspection ||
    !spread
  ) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading reporting">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const categoryMax = Math.max(1, ...categories.map((c) => c.total));

  return (
    <>
      <Section label="Overview" rule={false}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            value={overview.total}
            label="Cases filed"
            hint={`${overview.last30Days} in the last 30 days`}
          />
          <Figure
            value={overview.active}
            label="Active"
            hint="Being worked on, not yet resolved"
          />
          <Figure
            value={overview.resolved}
            label="Resolved"
            hint={
              overview.resolutionRate === null
                ? "No case has been attended yet"
                : `${percent(overview.resolutionRate)} of attended cases`
            }
          />
          <Figure
            value={
              overview.medianHoursToResolve === null
                ? null
                : formatDuration(overview.medianHoursToResolve)
            }
            label="Median to resolve"
            hint="Report filed to resolution recorded"
          />
        </div>
      </Section>

      <Section label="Filed and resolved, by week">
        <WeeklyChart points={weekly} />
      </Section>

      <Section label="Where cases are sitting">
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {spread.map((s) => (
            <div key={s.status} className="flex items-center gap-2">
              <StatusTag status={s.status} />
              <span className="font-mono text-[0.8125rem] tabular-nums text-muted-foreground">
                {s.total}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="By category">
        <ul className="space-y-2.5">
          {categories.map((c) => (
            <li key={c.category} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[0.8125rem] text-muted-foreground">
                {categoryLabel(c.category)}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground/70"
                  style={{ width: `${(c.total / categoryMax) * 100}%` }}
                />
              </span>
              <span className="w-9 shrink-0 text-right font-mono text-[0.8125rem] tabular-nums">
                {c.total}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="By severity">
        <div className="grid gap-3 sm:grid-cols-3">
          {severities.map((s) => (
            <div
              key={s.severity}
              className="rounded-[var(--radius)] border border-border px-3.5 py-3"
            >
              <PriorityTag priority={s.severity} />
              <p className="mt-2 font-mono text-[1.25rem] leading-none tabular-nums">
                {s.total}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Inspections">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            value={inspection.pass + inspection.fail}
            label="Decisions recorded"
            hint={
              inspection.passRate === null
                ? "None recorded yet"
                : `${percent(inspection.passRate)} passed`
            }
          />
          <Figure value={inspection.pass} label="Passed" />
          <Figure value={inspection.fail} label="Failed" />
          <Figure
            value={inspection.casesExtended}
            label="Cases extended"
            hint={
              inspection.grants === 0
                ? "No case has needed an administrator"
                : `${inspection.grants} grant${inspection.grants === 1 ? "" : "s"} recorded`
            }
          />
        </div>
        <p className="mt-4 max-w-[64ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
          Cases extended is the one figure here that measures the process rather
          than the city: how often a case ran out of inspection attempts and
          needed a person to step outside it.
        </p>
      </Section>
    </>
  );
}

/**
 * One headline figure.
 *
 * `null` renders as "No data" rather than 0, and a `string` is passed through
 * already formatted — the type carries the distinction so a caller cannot
 * accidentally print a null as a number.
 */
function Figure({
  value,
  label,
  hint,
}: {
  value: number | string | null;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border px-3.5 py-3">
      <p className="text-[0.75rem] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-mono text-[1.5rem] leading-none tabular-nums">
        {value === null ? (
          <span className="text-[0.9375rem] text-muted-foreground">No data</span>
        ) : typeof value === "number" ? (
          value.toLocaleString()
        ) : (
          value
        )}
      </p>
      {hint && (
        <p className="mt-1.5 text-[0.75rem] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Filed against resolved, two bars per week.
 *
 * Drawn with divs so it needs no charting dependency, and mirrored as a real
 * table for screen readers rather than left as a picture of a chart.
 */
function WeeklyChart({ points }: { points: SeriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.filed, p.resolved)));

  return (
    <div>
      <div
        className="flex items-end gap-1.5"
        role="img"
        aria-label="Cases filed and resolved per week"
      >
        {points.map((p) => (
          <div
            key={p.weekStart}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div className="flex h-24 w-full items-end justify-center gap-px">
              <span
                className="w-1/2 rounded-t-[2px] bg-foreground/70"
                style={{ height: `${(p.filed / max) * 100}%` }}
              />
              <span
                className="w-1/2 rounded-t-[2px] bg-status-resolved"
                style={{ height: `${(p.resolved / max) * 100}%` }}
              />
            </div>
            <span className="text-[0.6875rem] text-muted-foreground">
              {new Date(p.weekStart).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>Cases filed and resolved per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Filed</th>
            <th scope="col">Resolved</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.weekStart}>
              <th scope="row">
                {new Date(p.weekStart).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })}
              </th>
              <td>{p.filed}</td>
              <td>{p.resolved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** A duration coarse enough to read at a glance, without implying precision. */
function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
