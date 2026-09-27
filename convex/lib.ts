/**
 * Shared server helpers: case numbering, activity logging, work order creation,
 * duplicate detection and retry idempotency.
 */

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { err } from "./errors";
import {
  transitionLifecycle,
  type IssueStatus,
  type WorkOrderStatus,
} from "./lifecycle";
import { fundGoalFor } from "../lib/civic";

export const CONFIRMATION_THRESHOLD = 3;

export const CATEGORY_LABELS: Record<string, string> = {
  road: "Road damage",
  garbage: "Garbage",
  drainage: "Drainage",
  streetlight: "Streetlight",
};

export const DEFAULT_SCOPE: Record<string, string[]> = {
  road: [
    "Assess damaged surface area",
    "Clear debris from roadway",
    "Repair or fill damaged section",
    "Submit before, during, and after evidence",
  ],
  garbage: [
    "Clear accumulated waste",
    "Remove debris from surrounding area",
    "Transport waste to authorized disposal",
    "Submit before, during, and after evidence",
  ],
  drainage: [
    "Clear accumulated waste from drain",
    "Restore drainage flow",
    "Remove debris from surrounding area",
    "Submit before, during, and after evidence",
  ],
  streetlight: [
    "Inspect lighting fixture and power feed",
    "Repair or replace faulty components",
    "Verify illumination at night if applicable",
    "Submit before, during, and after evidence",
  ],
};

/**
 * Case numbers must be dense, gapless and permanent. The counter is read and
 * written inside the caller's mutation, and Convex mutations are serializable,
 * so two concurrent reports cannot claim the same number.
 */
export async function nextCaseNumber(ctx: MutationCtx): Promise<string> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "caseNumber"))
    .unique();

  let value = 1;
  if (existing) {
    value = existing.value + 1;
    await ctx.db.patch(existing._id, { value });
  } else {
    await ctx.db.insert("counters", { name: "caseNumber", value });
  }

  return `CIV-${String(value).padStart(6, "0")}`;
}

export async function logActivity(
  ctx: MutationCtx,
  args: {
    issueId: Id<"issues">;
    actorId?: Id<"users">;
    action: string;
    message: string;
  },
) {
  await ctx.db.insert("activityLogs", {
    issueId: args.issueId,
    actorId: args.actorId,
    action: args.action,
    message: args.message,
    createdAt: Date.now(),
  });
}

/**
 * Opens the work order for a verified case and moves the case in lockstep.
 *
 * Guarded against a second order for the same case, so the one-to-one
 * relationship between an issue and its work order cannot be broken by a
 * repeated confirmation arriving late.
 */
export async function createWorkOrderForIssue(
  ctx: MutationCtx,
  issueId: Id<"issues">,
  actorId?: Id<"users">,
) {
  const issue = await ctx.db.get(issueId);
  if (!issue) return null;
  if (issue.workOrderId) return issue.workOrderId;

  const scope = DEFAULT_SCOPE[issue.category] ?? DEFAULT_SCOPE.road;
  const now = Date.now();

  const workOrderId = await ctx.db.insert("workOrders", {
    issueId,
    caseNumber: issue.caseNumber,
    scope,
    status: "open",
    priority: issue.severity,
    createdAt: now,
    updatedAt: now,
  });

  // The community fund is minted with the work order, not by a separate
  // action. A case with no fund goal cannot be claimed, and writing it here is
  // the only path — so "no goal" and "no work order" are the same condition.
  // The amount is the case's tier; the reporter and the administrator can
  // adjust it later, but the row always exists for a case that has a work
  // order, which is what the claim gate and the dossier rely on.
  await ctx.db.insert("fundGoals", {
    issueId,
    workOrderId,
    targetCents: fundGoalFor(issue.category, issue.severity),
    createdAt: now,
  });

  // Link the pair *before* transitioning. `transitionLifecycle` reads the issue
  // to decide whether a work order must move in lockstep, so the reference has
  // to be visible to it. Without this the case would advance to `open` while
  // still pointing at nothing.
  await ctx.db.patch(issueId, { workOrderId, updatedAt: now });

  // `confirmed` is the only legal step into `open`, so a case that is already
  // further along (or closed) is left alone rather than dragged backwards.
  if (issue.status === "confirmed") {
    await transitionLifecycle(ctx, {
      issueId,
      workOrderId,
      to: "open",
      workOrderTo: "open",
      actorId,
      action: "work_order_created",
      message: `Work order opened for ${issue.caseNumber}`,
    });
  } else {
    await logActivity(ctx, {
      issueId,
      actorId,
      action: "work_order_created",
      message: `Work order opened for ${issue.caseNumber}`,
    });
  }

  return workOrderId;
}

/* Duplicate detection ------------------------------------------------------ */

/** ~11 m. Two reports closer than this are treated as the same spot. */
const DUPLICATE_RADIUS_KM = 0.011;
/** Reports inside this window are treated as the same incident. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
/** Below this, coordinates are too imprecise to deduplicate on. */
const MIN_COORD_PRECISION = 0.00005;

export type DuplicateReport = {
  issueId: Id<"issues">;
  caseNumber: string;
  createdAt: number;
} | null;

/**
 * Finds an equivalent report the same person already filed moments ago.
 *
 * Only *the reporter's own* recent reports are considered. Two different people
 * reporting the same pothole is the confirmation mechanism working as designed,
 * not a duplicate, so it must never be suppressed.
 */
export async function findDuplicateReport(
  ctx: QueryCtx,
  args: {
    reporterId: Id<"users">;
    category: string;
    lat: number;
    lng: number;
    now: number;
  },
): Promise<DuplicateReport> {
  if (
    Math.abs(args.lat) < MIN_COORD_PRECISION &&
    Math.abs(args.lng) < MIN_COORD_PRECISION
  ) {
    // Too coarse to judge; do not guess.
    return null;
  }

  const cutoff = args.now - DUPLICATE_WINDOW_MS;
  const mine = await ctx.db
    .query("issues")
    .withIndex("by_reporter", (q) => q.eq("reporterId", args.reporterId))
    .collect();

  for (const issue of mine) {
    if (issue.createdAt < cutoff) continue;
    if (issue.category !== args.category) continue;
    const dLat = issue.lat - args.lat;
    const dLng = issue.lng - args.lng;
    if (Math.sqrt(dLat * dLat + dLng * dLng) <= DUPLICATE_RADIUS_KM) {
      return {
        issueId: issue._id,
        caseNumber: issue.caseNumber,
        createdAt: issue.createdAt,
      };
    }
  }
  return null;
}

/* Idempotency -------------------------------------------------------------- */

/**
 * Claims a retry key, or reports the case an earlier attempt already produced.
 *
 * A double-clicked submit, a client retry after a dropped response, and a
 * replayed request all arrive here. The first to write wins.
 *
 * The key is scoped to the user. A globally-scoped key would let one account
 * pre-claim a value and deny submission to everyone else who later generates
 * the same key.
 *
 * Returns `{ fresh: true }` for a new key, `{ fresh: false, issueId }` when the
 * same key already produced a case — which the caller can return to the client
 * so a retry lands on the original submission rather than an error — and
 * `{ fresh: false, issueId: undefined }` while the first attempt is still in
 * flight, which is a genuine conflict.
 */
export async function claimIdempotencyKey(
  ctx: MutationCtx,
  key: string,
  userId: Id<"users">,
): Promise<{ fresh: boolean; issueId?: Id<"issues"> }> {
  if (!key) return { fresh: true };

  const scoped = `${userId}:${key}`;
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", scoped))
    .unique();
  if (existing) return { fresh: false, issueId: existing.issueId };

  await ctx.db.insert("idempotencyKeys", {
    key: scoped,
    userId,
    createdAt: Date.now(),
  });
  return { fresh: true };
}

/** Records which case a claimed key produced, so a retry can be resolved. */
export async function settleIdempotencyKey(
  ctx: MutationCtx,
  key: string,
  userId: Id<"users">,
  issueId: Id<"issues">,
): Promise<void> {
  if (!key) return;
  const row = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", `${userId}:${key}`))
    .unique();
  if (row) await ctx.db.patch(row._id, { issueId });
}

/* Type re-exports for convenience ------------------------------------------ */

export type { IssueStatus, WorkOrderStatus };
export { err };
