import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./auth";
import { toSafeError } from "./errors";
import { resetRateLimit, type LimitName } from "./rateLimit";
import { ISSUE_STATUSES } from "./lifecycle";

/**
 * Ops wipe — removes all app data. Not exposed in the UI.
 *
 * Restricted to the `ADMIN_CLERK_IDS` allowlist. This mutation is publicly
 * reachable over HTTP by anyone holding the deployment URL, so the guard lives
 * here rather than in the interface.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    try {
      const evidence = await ctx.db.query("evidence").collect();
      for (const row of evidence) {
        await ctx.storage.delete(row.storageId);
        await ctx.db.delete(row._id);
      }

      // Child rows first so no deletion ever leaves a dangling reference, even
      // part-way through a failure.
      const tables = [
        "resolutions",
        "activityLogs",
        "inspections",
        "confirmations",
        "workOrders",
        "issues",
        "rateLimits",
        "idempotencyKeys",
        "users",
        "counters",
      ] as const;

      const counts: Record<string, number> = { evidence: evidence.length };

      for (const table of tables) {
        const rows = await ctx.db.query(table).collect();
        counts[table] = rows.length;
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      }

      return counts;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Clears one rate limit budget for a subject.
 *
 * An operator who locks themselves out should not have to wait out the window,
 * and support needs a way to unblock a legitimate reporter.
 */
export const resetRateLimits = mutation({
  args: { name: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await resetRateLimit(ctx, args.name as LimitName, args.subject);
    return true;
  },
});

/* Integrity audit ---------------------------------------------------------- */

export type IntegrityViolation = {
  kind: string;
  issueId?: string;
  detail: string;
};

/**
 * Scans the database for broken invariants.
 *
 * The write path is designed to make these states unreachable; this exists so
 * that "unreachable" is a *checked* claim rather than an assumption. It is a
 * read, is admin-only, and reports findings without mutating anything.
 */
export const integrityCheck = query({
  args: {},
  handler: async (ctx): Promise<IntegrityViolation[]> => {
    await requireAdmin(ctx);

    const violations: IntegrityViolation[] = [];
    const [issues, workOrders, confirmations, evidence, inspections, resolutions] =
      await Promise.all([
        ctx.db.query("issues").collect(),
        ctx.db.query("workOrders").collect(),
        ctx.db.query("confirmations").collect(),
        ctx.db.query("evidence").collect(),
        ctx.db.query("inspections").collect(),
        ctx.db.query("resolutions").collect(),
      ]);

    const workOrderById = new Map(workOrders.map((w) => [w._id, w]));
    const issueById = new Map(issues.map((i) => [i._id, i]));

    for (const issue of issues) {
      // The headline invariant: a closed case must have a resolution record.
      if (issue.status === "closed") {
        const resolution = resolutions.find((r) => r.issueId === issue._id);
        if (!resolution) {
          violations.push({
            kind: "closed_without_resolution",
            issueId: issue._id,
            detail: `${issue.caseNumber} is closed but has no resolution record`,
          });
          continue;
        }
        const inspection = inspections.find(
          (i) => i._id === resolution.inspectionId,
        );
        if (!inspection || inspection.result !== "pass") {
          violations.push({
            kind: "closed_without_pass",
            issueId: issue._id,
            detail: `${issue.caseNumber} is closed but its resolution does not reference a passed inspection`,
          });
        }
      }

      // A case claiming to be in the work phase must actually have an order,
      // and the two statuses must agree.
      const needsWorkOrder = [
        "open",
        "claimed",
        "in_progress",
        "completion_submitted",
        "inspection",
        "closed",
      ].includes(issue.status);

      if (needsWorkOrder && !issue.workOrderId) {
        violations.push({
          kind: "work_phase_without_order",
          issueId: issue._id,
          detail: `${issue.caseNumber} is ${issue.status} with no work order`,
        });
      }

      if (issue.workOrderId) {
        const wo = workOrderById.get(issue.workOrderId);
        if (!wo) {
          violations.push({
            kind: "dangling_work_order",
            issueId: issue._id,
            detail: `${issue.caseNumber} points at a work order that does not exist`,
          });
        } else {
          // `verified` is a timeline-only state that is immediately superseded
          // by `open` when the order is created, so it is legitimately absent
          // from the work order status set.
          const expected = wo.status;
          if (
            issue.status !== "closed" &&
            issue.status !== "confirmed" &&
            issue.status !== expected
          ) {
            violations.push({
              kind: "status_desync",
              issueId: issue._id,
              detail: `${issue.caseNumber} is ${issue.status} but its work order is ${expected}`,
            });
          }
        }
      }

      // The denormalised counter must match the rows it summarises.
      const actual = confirmations.filter((c) => c.issueId === issue._id).length;
      if (actual !== issue.confirmationCount) {
        violations.push({
          kind: "confirmation_count_mismatch",
          issueId: issue._id,
          detail: `${issue.caseNumber} claims ${issue.confirmationCount} confirmations but has ${actual}`,
        });
      }

      const evCount = evidence.filter((e) => e.issueId === issue._id).length;
      if (evCount !== issue.evidenceCount) {
        violations.push({
          kind: "evidence_count_mismatch",
          issueId: issue._id,
          detail: `${issue.caseNumber} claims ${issue.evidenceCount} items of evidence but has ${evCount}`,
        });
      }
    }

    // One work order per case.
    const ordersPerIssue = new Map<string, number>();
    for (const wo of workOrders) {
      ordersPerIssue.set(wo.issueId, (ordersPerIssue.get(wo.issueId) ?? 0) + 1);
    }
    for (const [issueId, count] of ordersPerIssue) {
      if (count > 1) {
        violations.push({
          kind: "duplicate_work_order",
          issueId,
          detail: `case has ${count} work orders`,
        });
      }
    }

    // One confirmation per person per case.
    const seenConfirmations = new Set<string>();
    for (const c of confirmations) {
      const key = `${c.issueId}:${c.userId}`;
      if (seenConfirmations.has(key)) {
        violations.push({
          kind: "duplicate_confirmation",
          issueId: c.issueId,
          detail: "a user confirmed the same case twice",
        });
      }
      seenConfirmations.add(key);
    }

    // Orphan rows.
    for (const wo of workOrders) {
      if (!issueById.has(wo.issueId)) {
        violations.push({
          kind: "orphan_work_order",
          detail: "work order references a case that does not exist",
        });
      }
    }
    for (const e of evidence) {
      if (!issueById.has(e.issueId)) {
        violations.push({
          kind: "orphan_evidence",
          detail: "evidence references a case that does not exist",
        });
      }
    }

    // Any status currently in the database that the machine does not define.
    const known = new Set<string>(ISSUE_STATUSES);
    for (const issue of issues) {
      if (!known.has(issue.status)) {
        violations.push({
          kind: "unknown_status",
          issueId: issue._id,
          detail: `${issue.caseNumber} has unrecognised status "${issue.status}"`,
        });
      }
    }

    return violations;
  },
});
