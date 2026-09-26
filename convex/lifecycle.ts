/**
 * Lifecycle state machine.
 *
 * This module is the only place allowed to change an issue or work order
 * status. Centralising it buys three things:
 *
 *  1. **Illegal transitions are impossible.** Every edge is declared. A caller
 *     asking for `closed → in_progress` is rejected rather than silently
 *     corrupting the record.
 *  2. **The issue and its work order move together.** They are two projections
 *     of one fact, so they are written in the same mutation and a half-applied
 *     transition is not representable.
 *  3. **Closing a case has a proof obligation.** `closed` is not reachable
 *     without a recorded pass inspection *and* before/after evidence from the
 *     assigned contractor, so "resolved with no resolution data" cannot be
 *     constructed.
 *
 * The UI derives its copy from the same tables, so a state the server forbids
 * is never offered as a button.
 */

import { v } from "convex/values";
import type { Value } from "convex/values";
import { err } from "./errors";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/* Vocabulary --------------------------------------------------------------- */

export const ROLES = ["citizen", "contractor", "inspector"] as const;
export type Role = (typeof ROLES)[number];

export const ISSUE_STATUSES = [
  "reported",
  "confirmed",
  "verified",
  "open",
  "claimed",
  "in_progress",
  "completion_submitted",
  "inspection",
  "closed",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const WORK_ORDER_STATUSES = [
  "open",
  "claimed",
  "in_progress",
  "completion_submitted",
  "inspection",
  "closed",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const issueStatusValidator = v.union(
  ...ISSUE_STATUSES.map((s) => v.literal(s)),
);
export const workOrderStatusValidator = v.union(
  ...WORK_ORDER_STATUSES.map((s) => v.literal(s)),
);

/* Transition tables -------------------------------------------------------- */

/** Legal issue transitions. Anything absent is refused. */
const ISSUE_NEXT: Record<IssueStatus, readonly IssueStatus[]> = {
  reported: ["confirmed"],
  confirmed: ["verified", "open"],
  // `verified` is recorded in the timeline when a work order opens. It is kept
  // as a real state for historical rows, and the only edge out of it is `open`.
  verified: ["open"],
  // `open` is where a work order exists and nobody has taken it.
  open: ["claimed"],
  claimed: ["in_progress"],
  in_progress: ["completion_submitted", "inspection"],
  completion_submitted: ["inspection", "in_progress"],
  inspection: ["closed", "in_progress"],
  // Terminal. Reopening a closed case is deliberately not supported; a
  // regression is filed as a new case so the original record stays intact.
  closed: [],
};

/** Legal work order transitions. */
const WORK_ORDER_NEXT: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  open: ["claimed"],
  claimed: ["in_progress"],
  in_progress: ["completion_submitted", "in_progress"],
  completion_submitted: ["inspection", "in_progress"],
  inspection: ["closed", "in_progress"],
  closed: [],
};

export function isLegalIssueTransition(from: string, to: string): boolean {
  return (ISSUE_NEXT[from as IssueStatus] ?? []).includes(to as IssueStatus);
}

export function isLegalWorkOrderTransition(from: string, to: string): boolean {
  return (WORK_ORDER_NEXT[from as WorkOrderStatus] ?? []).includes(
    to as WorkOrderStatus,
  );
}

/**
 * Asserts a transition is declared, and produces a message that names the
 * current state without leaking any document id.
 */
export function assertIssueTransition(from: string, to: string): void {
  if (!isLegalIssueTransition(from, to)) {
    throw err.transition(
      to === "closed"
        ? "This case cannot be closed from its current stage."
        : `A case that is ${humanState(from)} cannot move to ${humanState(to)}.`,
    );
  }
}

export function assertWorkOrderTransition(from: string, to: string): void {
  if (!isLegalWorkOrderTransition(from, to)) {
    throw err.transition(
      `Work that is ${humanState(from)} cannot move to ${humanState(to)}.`,
    );
  }
}

function humanState(s: string): string {
  return s.replaceAll("_", " ");
}

/* Lockstep writer ---------------------------------------------------------- */

export type LifecycleTarget = {
  issueId: Id<"issues">;
  /** Absent when the case has not reached the point of having work ordered. */
  workOrderId?: Id<"workOrders">;
  to: IssueStatus;
  /** Must match `to` when a work order exists. */
  workOrderTo?: WorkOrderStatus;
  actorId?: Id<"users">;
  action: string;
  message: string;
};

/**
 * The single writer for lifecycle state.
 *
 * Reads the current issue (and work order), asserts both edges, then patches
 * both documents in this one mutation. Convex mutations are serializable, so a
 * competing transition is re-read against the new state and rejected by the
 * assertion rather than overwriting it.
 */
export async function transitionLifecycle(
  ctx: MutationCtx,
  target: LifecycleTarget,
): Promise<void> {
  const { issueId, to, workOrderTo, actorId, action, message } = target;
  const now = Date.now();

  const issue = await ctx.db.get(issueId);
  if (!issue) throw err.notFound("That case no longer exists.");

  assertIssueTransition(issue.status, to);

  if (issue.workOrderId) {
    if (!workOrderTo) {
      // A work order exists, so the caller must say where it goes. Refusing
      // here is what keeps the two documents from drifting apart.
      throw err.internal("Internal error: work order state not supplied.");
    }
    const wo = await ctx.db.get(issue.workOrderId);
    if (!wo) {
      // The case points at a work order that is gone. Treat the case as the
      // source of truth rather than writing a dangling reference forward.
      throw err.conflict(
        "This case is inconsistent and needs an administrator to repair it.",
      );
    }
    // A work order is often *created* directly in the state the case is moving
    // into, so "already there" is a legitimate no-op rather than an illegal
    // transition. Anything else must be a declared edge.
    if (wo.status !== workOrderTo) {
      assertWorkOrderTransition(wo.status, workOrderTo);
    }
  }

  // The proof obligation for closure, enforced at the only edge that can close.
  if (to === "closed") {
    await assertClosable(ctx, issue);
  }

  if (issue.workOrderId && workOrderTo) {
    const current = await ctx.db.get(issue.workOrderId);
    // Skip the write entirely when the order is already where it belongs, so a
    // no-op transition does not churn `updatedAt` and reorder the inspector's
    // queue.
    if (current && current.status !== workOrderTo) {
      await ctx.db.patch(issue.workOrderId, {
        status: workOrderTo,
        updatedAt: now,
      });
    }
  }
  await ctx.db.patch(issueId, { status: to, updatedAt: now });

  await ctx.db.insert("activityLogs", {
    issueId,
    actorId,
    action,
    message,
    createdAt: now,
  });
}

/**
 * A case may only close when the record actually contains a resolution:
 * a `pass` inspection, and `before` + `after` photographs from the contractor
 * who was assigned the work. This is the invariant the whole product rests on.
 */
async function assertClosable(
  ctx: MutationCtx,
  issue: Doc<"issues">,
): Promise<void> {
  if (!issue.workOrderId) {
    throw err.precondition(
      "A case cannot be closed before a work order exists.",
    );
  }

  const wo = await ctx.db.get(issue.workOrderId);
  if (!wo?.contractorId) {
    throw err.precondition(
      "A case cannot be closed before the work has been assigned.",
    );
  }

  const inspections = await ctx.db
    .query("inspections")
    .withIndex("by_workOrder", (q) => q.eq("workOrderId", wo._id))
    .collect();

  if (!inspections.some((i) => i.result === "pass")) {
    throw err.precondition(
      "A case cannot be closed without a passed inspection.",
    );
  }

  const evidence = await ctx.db
    .query("evidence")
    .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
    .collect();

  const executorKinds = new Set(
    evidence.filter((e) => e.userId === wo.contractorId).map((e) => e.kind),
  );
  if (!executorKinds.has("before") || !executorKinds.has("after")) {
    throw err.precondition(
      "A case cannot be closed without before and after photographs from the assigned contractor.",
    );
  }
}

/* Attempt cap -------------------------------------------------------------- */

/**
 * How many times an inspection may fail before a case is escalated.
 *
 * Without this, a contractor and an inspector can loop `fail → in_progress →
 * completion_submitted → fail` forever, which is both an abuse vector and a way
 * to bury a real defect under paperwork.
 */
export const MAX_INSPECTION_FAILURES = 3;

export async function assertFailureBudget(
  ctx: MutationCtx,
  issueId: Id<"issues">,
): Promise<void> {
  const failures = await ctx.db
    .query("inspections")
    .withIndex("by_issue_result", (q) =>
      q.eq("issueId", issueId).eq("result", "fail"),
    )
    .collect();

  if (failures.length >= MAX_INSPECTION_FAILURES) {
    throw err.precondition(
      "This case has failed inspection too many times and needs an administrator.",
    );
  }
}

/* Exported for tests and the schema ---------------------------------------- */

export const checklistShape = v.object({
  correctLocation: v.boolean(),
  workPerformed: v.boolean(),
  beforeEvidence: v.boolean(),
  afterEvidence: v.boolean(),
  requirementsMet: v.boolean(),
});

export type Checklist = {
  correctLocation: boolean;
  workPerformed: boolean;
  beforeEvidence: boolean;
  afterEvidence: boolean;
  requirementsMet: boolean;
};

export function allChecked(c: Value): boolean {
  return Object.values(c as Record<string, unknown>).every((v) => v === true);
}
