/**
 * Oversight: the case queue an administrator can actually act on.
 *
 * This is the product half of administration, and it is deliberately narrow. An
 * administrator's entire power here is to let a stuck case have another
 * inspection attempt. They cannot:
 *
 *  - close a case — that still requires a passed inspection, and no admin path
 *    exists to one, because "closed" is the product's central promise;
 *  - rewrite or delete a failed inspection — the inspection record is the
 *    evidence, and quietly editing it would make the audit trail a fiction;
 *  - do anything the three civic roles do not.
 *
 * The queue is derived from the inspection history rather than stored, so there
 * is no flag that can disagree with the record it claims to summarise.
 */

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireOversight } from "./auth";
import { err, toSafeError } from "./errors";
import {
  inspectionFailureAllowance,
  MAX_INSPECTION_FAILURES,
} from "./lifecycle";
import { cleanOptionalString, clampLimit } from "./validation";

/** Rows the queue will return. Small, because a queue this long is not a queue. */
/**
 * The queue is small and bounded on purpose. A scan cap is needed because a
 * case qualifies by *derived* comparison rather than by an index entry, so
 * there is no index to range over — which is the price of never storing a
 * `locked` flag, and a fair trade at this size.
 */
const QUEUE = { def: 50, max: 100, scan: 2000 } as const;

/** Attempts one grant may add. Bounded so a typo cannot unlock a case forever. */
const MAX_GRANT = 5;

export type EscalatedCase = {
  issueId: Id<"issues">;
  caseNumber: string;
  title: string;
  category: string;
  status: string;
  severity: string;
  lat: number;
  lng: number;
  failures: number;
  allowance: number;
  granted: number;
  /** Set once any administrator has acted, for context in the queue. */
  lastGrant: { attempts: number; note?: string; createdAt: number } | null;
  updatedAt: number;
};

/**
 * Cases that have spent their inspection allowance, most recently touched first.
 *
 * A case qualifies when it has failed as many inspections as it is allowed. It
 * is *not* filtered out once an administrator grants more attempts — the grant
 * lifts the block, but leaving the case visible with its new allowance is what
 * lets the next administrator see that someone already handled it, rather than
 * granting a second extension to a case that was resolved ten minutes ago.
 */
export const escalatedCases = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOversight(ctx, "Only administrators can see the escalation queue.");
    const limit = clampLimit(args.limit, QUEUE.def, QUEUE.max);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(QUEUE.scan);

    const rows: EscalatedCase[] = [];
    for (const issue of issues) {
      const { failures, allowance, granted } = await inspectionFailureAllowance(
        ctx,
        issue._id,
      );

      // Stuck means spent its allowance. A case an administrator has already
      // extended stays listed while it is still live, so the next administrator
      // sees that decision instead of extending a case that was handled ten
      // minutes ago. Closing it takes it out with every other closed case.
      const stuck = failures >= allowance;
      if (!stuck && (granted === 0 || issue.status === "closed")) continue;

      const list = await ctx.db
        .query("budgetGrants")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();
      const last = list.sort((a, b) => b.createdAt - a.createdAt)[0];

      rows.push({
        issueId: issue._id,
        caseNumber: issue.caseNumber,
        title: issue.title,
        category: issue.category,
        status: issue.status,
        severity: issue.severity,
        lat: issue.lat,
        lng: issue.lng,
        failures,
        allowance,
        granted,
        lastGrant: last
          ? { attempts: last.attempts, note: last.note, createdAt: last.createdAt }
          : null,
        updatedAt: issue.updatedAt,
      });

      if (rows.length >= limit) break;
    }

    return rows;
  },
});

/**
 * Allows a case more inspection attempts.
 *
 * The only write an administrator performs. It appends to `budgetGrants` rather
 * than mutating a counter, so the decision is attributable and permanent, and it
 * writes an activity log entry because the case history is what the reporter and
 * the contractor read to find out what happened while they were waiting.
 */
export const grantBudget = mutation({
  args: {
    issueId: v.id("issues"),
    attempts: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireOversight(
      ctx,
      "Only administrators can allow another inspection attempt.",
    );

    try {
      if (!Number.isInteger(args.attempts) || args.attempts < 1) {
        throw err.invalid("Allow at least one more attempt.");
      }
      if (args.attempts > MAX_GRANT) {
        throw err.invalid(`Allow at most ${MAX_GRANT} more attempts at a time.`);
      }
      const note = cleanOptionalString(args.note, "reason", {
        min: 3,
        max: 400,
      });

      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");

      const before = await inspectionFailureAllowance(ctx, args.issueId);
      if (before.failures < before.allowance) {
        throw err.conflict(
          "That case still has attempts left, so it does not need an administrator.",
        );
      }

      const now = Date.now();
      await ctx.db.insert("budgetGrants", {
        issueId: args.issueId,
        grantedBy: admin._id,
        attempts: args.attempts,
        note,
        createdAt: now,
      });

      // On the case history, in the words of the person who decided. The
      // reporter is entitled to know that a human looked at their case.
      await ctx.db.insert("activityLogs", {
        issueId: args.issueId,
        actorId: admin._id,
        action: "budget_granted",
        message: note
          ? `An administrator allowed ${args.attempts} more inspection ${args.attempts === 1 ? "attempt" : "attempts"}: ${note}`
          : `An administrator allowed ${args.attempts} more inspection ${args.attempts === 1 ? "attempt" : "attempts"}.`,
        createdAt: now,
      });

      return { allowance: before.allowance + args.attempts };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export { MAX_INSPECTION_FAILURES, MAX_GRANT };
