import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireRole } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import {
  allChecked,
  assertFailureBudget,
  checklistShape,
  transitionLifecycle,
} from "./lifecycle";
import { LIMITS, cleanOptionalString } from "./validation";

/** Work order states that represent "an inspector needs to act on this". */
const AWAITING_INSPECTION = ["completion_submitted", "inspection"] as const;

function awaitingInspector(status: string) {
  return (AWAITING_INSPECTION as readonly string[]).includes(status);
}

async function hydrate(ctx: QueryCtx, wos: Doc<"workOrders">[]) {
  return Promise.all(
    wos.map(async (wo) => {
      const [issue, contractor, rows] = await Promise.all([
        ctx.db.get(wo.issueId),
        wo.contractorId ? ctx.db.get(wo.contractorId) : null,
        ctx.db
          .query("evidence")
          .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
          .collect(),
      ]);
      // Kinds only — the queue needs to know whether a case is *decidable*, not
      // to display frames. Signed URLs are minted on the detail screen.
      return {
        ...wo,
        issue,
        contractorName: contractor?.name,
        evidenceKinds: [...new Set(rows.map((r) => r.kind))],
        evidenceCount: rows.length,
      };
    }),
  );
}

export const listQueue = query({
  args: {},
  handler: async (ctx) => {
    // The queue enumerates every case awaiting inspection, with its evidence
    // kinds and inspection history. That is an internal work list, so it is
    // gated here as well as behind the /inspect route.
    await requireRole(ctx, "inspector", "Only inspectors can see the inspection queue");

    const rows = await Promise.all(
      AWAITING_INSPECTION.map((status) =>
        ctx.db
          .query("workOrders")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect(),
      ),
    );

    const seen = new Set<string>();
    const pending = rows.flat().filter((wo) => {
      if (seen.has(wo._id)) return false;
      seen.add(wo._id);
      return true;
    });

    const hydrated = await hydrate(ctx, pending);
    hydrated.sort((a, b) => a.updatedAt - b.updatedAt);
    return hydrated;
  },
});

/**
 * An inspector picks the case up: `completion_submitted` → `inspection`.
 * Keeps both spec states real instead of collapsing them on submit.
 */
export const beginInspection = mutation({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const inspector = await requireRole(
      ctx,
      "inspector",
      "Only inspectors can start an inspection",
    );

    try {
      const wo = await ctx.db.get(args.workOrderId);
      if (!wo) throw err.notFound("That work order no longer exists.");

      await transitionLifecycle(ctx, {
        issueId: wo.issueId,
        workOrderId: wo._id,
        to: "inspection",
        workOrderTo: "inspection",
        actorId: inspector._id,
        action: "inspection_started",
        message: `${inspector.name} began inspection`,
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const getForWorkOrder = query({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    // Inspector-only: this view carries the full evidence set and the
    // inspection history needed to decide a case.
    await requireRole(ctx, "inspector", "Only inspectors can see the inspection record");

    const wo = await ctx.db.get(args.workOrderId);
    if (!wo) return null;

    const [issue, evidenceRows, inspections, contractor] = await Promise.all([
      ctx.db.get(wo.issueId),
      ctx.db
        .query("evidence")
        .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
        .collect(),
      ctx.db
        .query("inspections")
        .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
        .collect(),
      wo.contractorId ? ctx.db.get(wo.contractorId) : null,
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
      workOrder: { ...wo, contractorName: contractor?.name },
      issue,
      evidence,
      inspections,
    };
  },
});

/**
 * Records an inspection decision.
 *
 * On a pass this writes a `resolutions` row in the same mutation that closes the
 * case, so "status says resolved" and "the resolution exists" are the same fact
 * rather than two that can drift. The transition writer additionally refuses to
 * close a case that has no pass inspection and no contractor before/after
 * evidence, so the invariant holds even if this function is later refactored.
 */
export const decide = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    result: v.union(v.literal("pass"), v.literal("fail")),
    checklist: checklistShape,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inspector = await requireRole(
      ctx,
      "inspector",
      "Only inspectors can decide",
    );
    await enforceRateLimit(ctx, "inspectionDecide", inspector._id);

    try {
      const wo = await ctx.db.get(args.workOrderId);
      if (!wo) throw err.notFound("That work order no longer exists.");
      if (!awaitingInspector(wo.status)) {
        throw err.conflict("This work order is not awaiting inspection.");
      }

      // An inspector must not decide on work they filed evidence for.
      if (wo.contractorId === inspector._id) {
        throw err.forbidden("You cannot inspect your own work.");
      }

      const notes = cleanOptionalString(
        args.notes,
        "Notes",
        LIMITS.checklistNotes,
      );

      if (args.result === "pass") {
        // Completion is not self-certifying: a PASS needs a complete checklist
        // and evidence from the assigned contractor.
        if (!allChecked(args.checklist)) {
          throw err.precondition(
            "Every checklist item must pass before you can close a case.",
          );
        }

        const evidence = await ctx.db
          .query("evidence")
          .withIndex("by_issue", (q) => q.eq("issueId", wo.issueId))
          .collect();
        const executorKinds = new Set(
          evidence
            .filter((e) => e.userId === wo.contractorId)
            .map((e) => e.kind),
        );
        if (!executorKinds.has("before") || !executorKinds.has("after")) {
          throw err.precondition(
            "This case is missing before or after photographs from the assigned contractor.",
          );
        }
      } else {
        // Bounds the fail → resubmit → fail loop.
        await assertFailureBudget(ctx, wo.issueId);
      }

      const now = Date.now();
      const inspectionId = await ctx.db.insert("inspections", {
        workOrderId: args.workOrderId,
        issueId: wo.issueId,
        inspectorId: inspector._id,
        result: args.result,
        checklist: args.checklist,
        notes,
        createdAt: now,
      });

      if (args.result === "pass") {
        // The resolution is written first. If the transition below is rejected
        // the whole mutation rolls back, so the two can never disagree.
        await ctx.db.insert("resolutions", {
          issueId: wo.issueId,
          workOrderId: args.workOrderId,
          inspectionId,
          inspectorId: inspector._id,
          notes,
          createdAt: now,
        });
      }

      await transitionLifecycle(ctx, {
        issueId: wo.issueId,
        workOrderId: wo._id,
        to: args.result === "pass" ? "closed" : "in_progress",
        workOrderTo: args.result === "pass" ? "closed" : "in_progress",
        actorId: inspector._id,
        action: args.result === "pass" ? "inspection_passed" : "inspection_failed",
        message:
          args.result === "pass"
            ? `${inspector.name} passed inspection — case closed`
            : `${inspector.name} failed inspection — returned to the contractor`,
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});
