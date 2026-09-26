import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOps } from "./auth";
import { err, toSafeError } from "./errors";
import { resetRateLimit, type LimitName } from "./rateLimit";
import { ISSUE_STATUSES, MAX_INSPECTION_FAILURES } from "./lifecycle";
import { roleValidator } from "./schema";

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
    await requireOps(ctx);

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
        "budgetGrants",
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
    await requireOps(ctx);
    await resetRateLimit(ctx, args.name as LimitName, args.subject);
    return true;
  },
});

/**
 * Grants or revokes a role on somebody else's account.
 *
 * Ops-only, and separate from `users.setRole` because that mutation is
 * inherently self-service: it resolves the caller from the identity and changes
 * the caller's own row, so there is no way for it to promote anyone else. The
 * `admin` role has to be grantable by an operator, so it needs a function that
 * takes a target.
 *
 * Two deliberate constraints:
 *
 *  - The target must already exist. Creating a row here would mint an identity
 *    for a Clerk subject that has never signed in, which is a much larger
 *    capability than changing a role and is not something an allowlist entry
 *    should quietly imply.
 *  - An operator cannot grant themselves `admin`, and cannot remove their own
 *    ops access by demoting themselves. Both are footguns rather than attacks,
 *    but the second would leave a deployment with no administrator at all.
 */
export const grantRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const operator = await requireOps(ctx);

    try {
      if (operator?._id === args.userId) {
        throw err.invalid(
          "An operator cannot change their own role here. Use setRole for yourself.",
        );
      }

      const target = await ctx.db.get(args.userId);
      if (!target) throw err.notFound("That account no longer exists.");

      const previous = target.role ?? null;
      if (previous === args.role) return { previous, role: args.role };

      await ctx.db.patch(args.userId, { role: args.role });
      return { previous, role: args.role };
    } catch (e) {
      throw toSafeError(e);
    }
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
    await requireOps(ctx);

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

    // Cases that have spent their whole inspection budget and cannot be failed
    // again. Not corruption — a deliberate dead end — but it is the one state an
    // administrator has to act on, so it belongs in the same report rather than
    // in a query somebody has to remember to run.
    const grants = await ctx.db.query("budgetGrants").collect();
    const grantedByIssue = new Map<string, number>();
    for (const g of grants) {
      grantedByIssue.set(
        g.issueId,
        (grantedByIssue.get(g.issueId) ?? 0) + g.attempts,
      );
    }
    const failuresByIssue = new Map<string, number>();
    for (const i of inspections) {
      if (i.result !== "fail") continue;
      failuresByIssue.set(i.issueId, (failuresByIssue.get(i.issueId) ?? 0) + 1);
    }
    for (const issue of issues) {
      const failures = failuresByIssue.get(issue._id) ?? 0;
      const allowance = MAX_INSPECTION_FAILURES + (grantedByIssue.get(issue._id) ?? 0);
      if (failures >= allowance) {
        violations.push({
          kind: "inspection_budget_exhausted",
          issueId: issue._id,
          detail: `${issue.caseNumber} has failed ${failures} of ${allowance} allowed inspections and is waiting on an administrator`,
        });
      }
    }

    return violations;
  },
});
