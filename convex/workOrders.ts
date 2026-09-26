import { mutation, query } from "./_generated/server";
import { formatCents } from "../lib/civic";
import { v } from "convex/values";
import { getCurrentUser, requireRole, requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import { transitionLifecycle } from "./lifecycle";

/* Reads -------------------------------------------------------------------- */

export const get = query({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) return null;

    const [issue, contractor, evidenceRows] = await Promise.all([
      ctx.db.get(workOrder.issueId),
      workOrder.contractorId ? ctx.db.get(workOrder.contractorId) : null,
      ctx.db
        .query("evidence")
        .withIndex("by_issue", (q) => q.eq("issueId", workOrder.issueId))
        .collect(),
    ]);

    const evidence = await Promise.all(
      evidenceRows.map(async (e) => {
        const user = await ctx.db.get(e.userId);
        return {
          ...e,
          url: await ctx.storage.getUrl(e.storageId),
          userName: user?.name ?? "Unknown",
          userRole: user?.role,
        };
      }),
    );

    return {
      ...workOrder,
      issue,
      contractorName: contractor?.name,
      evidence,
    };
  },
});

export const listAvailable = query({
  args: {},
  handler: async (ctx) => {
    // `proxy.ts` protects the /contractor page, but the Convex deployment is a
    // public endpoint: anything reachable from the client can be called
    // directly. The role check has to live here, not only in the UI.
    await requireRole(ctx, "contractor", "Only contractors can see the work board");

    const open = await ctx.db
      .query("workOrders")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    return Promise.all(
      open.map(async (wo) => {
        const issue = await ctx.db.get(wo.issueId);
        // Kinds only, no signed URLs: a list view must not mint a storage URL
        // per photograph. The contractor opens the case to see the frames.
        const rows = await ctx.db
          .query("evidence")
          .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
          .collect();
        return {
          ...wo,
          issue,
          evidenceKinds: [...new Set(rows.map((r) => r.kind))],
          evidenceCount: rows.length,
        };
      }),
    );
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.role !== "contractor") return [];

    const assigned = await ctx.db
      .query("workOrders")
      .withIndex("by_contractor", (q) => q.eq("contractorId", user._id))
      .collect();

    const mine = assigned.filter(
      (wo) => wo.status !== "closed" && wo.status !== "open",
    );

    return Promise.all(
      mine.map(async (wo) => {
        const issue = await ctx.db.get(wo.issueId);
        return { ...wo, issue };
      }),
    );
  },
});

/* Writes ------------------------------------------------------------------- */

/**
 * Claims an open work order.
 *
 * The `status !== "open"` guard plus the lockstep transition make this safe
 * against a double click and against two contractors racing: Convex mutations
 * are serializable, so the loser re-reads `claimed` and is rejected by the
 * transition table rather than overwriting the winner.
 */
export const accept = mutation({ // placeholder
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const contractor = await requireRole(
      ctx,
      "contractor",
      "Only contractors can accept work",
    );
    await enforceRateLimit(ctx, "workAccept", contractor._id);

    try {
      const wo = await ctx.db.get(args.workOrderId);
      if (!wo) throw err.notFound("That work order no longer exists.");
      if (wo.status !== "open") {
        throw err.conflict("Another contractor has already taken this work.");
      }

      // Check if the work order has sufficient funding
      const goal = await ctx.db
        .query("fundGoals")
        .withIndex("by_workOrder", (q) => q.eq("workOrderId", wo._id))
        .first();

      if (goal) {
        const contributions = await ctx.db
          .query("fundContributions")
          .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
          .collect();

        const totalContributions = contributions.reduce((sum, c) => sum + c.amountCents, 0);
        const fundingThreshold = goal.targetCents * 0.8; // 80% of the goal

        if (totalContributions < fundingThreshold) {
          throw err.conflict(
            `This work order requires at least £${formatCents(fundingThreshold)} in contributions to be claimed. ` +
            `Current total: £${formatCents(totalContributions)}.`
          );
        }
      }

      await ctx.db.patch(args.workOrderId, {
        contractorId: contractor._id,
      });

      await transitionLifecycle(ctx, {
        issueId: wo.issueId,
        workOrderId: wo._id,
        to: "claimed",
        workOrderTo: "claimed",
        actorId: contractor._id,
        action: "claimed",
        message: `${contractor.name} claimed the work order`,
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const start = mutation({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const contractor = await requireUser(ctx);

    try {
      const wo = await ctx.db.get(args.workOrderId);
      if (!wo) throw err.notFound("That work order no longer exists.");
      // Ownership first: a contractor must not learn anything about an order
      // that is not theirs, including that it exists.
      if (wo.contractorId !== contractor._id) {
        throw err.forbidden();
      }

      await transitionLifecycle(ctx, {
        issueId: wo.issueId,
        workOrderId: wo._id,
        to: "in_progress",
        workOrderTo: "in_progress",
        actorId: contractor._id,
        action: "in_progress",
        message: `${contractor.name} started work`,
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const submitCompletion = mutation({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const contractor = await requireRole(
      ctx,
      "contractor",
      "Only the assigned contractor can submit completion",
    );

    try {
      const wo = await ctx.db.get(args.workOrderId);
      if (!wo) throw err.notFound("That work order no longer exists.");
      if (wo.contractorId !== contractor._id) throw err.forbidden();

      const evidence = await ctx.db
        .query("evidence")
        .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
        .collect();

      // Proof must come from the executor who performed the work — otherwise a
      // third party could satisfy the evidence gate on their behalf.
      const ownKinds = new Set(
        evidence.filter((e) => e.userId === contractor._id).map((e) => e.kind),
      );
      if (!ownKinds.has("before")) {
        throw err.precondition("Add your own before photograph first.");
      }
      if (!ownKinds.has("after")) {
        throw err.precondition("Add your own after photograph first.");
      }

      await transitionLifecycle(ctx, {
        issueId: wo.issueId,
        workOrderId: wo._id,
        to: "completion_submitted",
        workOrderTo: "completion_submitted",
        actorId: contractor._id,
        action: "completion_submitted",
        message: `${contractor.name} submitted completion — awaiting inspection`,
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});
