import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { evidenceKindValidator } from "./schema";
import { logActivity } from "./lib";
import { requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import { LIMITS, assertFreshUpload, cleanOptionalString } from "./validation";

/**
 * Mints a one-shot upload URL.
 *
 * Rate limited on its own because it is the cheapest way to consume storage: it
 * does no work and touches no case. The bytes are validated in `attach`, once
 * the upload actually exists.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "uploadUrl", user._id);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    issueId: v.id("issues"),
    storageId: v.id("_storage"),
    kind: evidenceKindValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "evidenceAttach", user._id);

    try {
      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");
      if (issue.status === "closed") {
        throw err.conflict("This case is closed — evidence can no longer be added.");
      }

      const note = cleanOptionalString(args.note, "Note", LIMITS.note);

      // The upload must exist, be a real image, and be within the size cap.
      // Verified here rather than trusting the client.
      await assertFreshUpload(ctx, args.storageId);

      const workOrder = issue.workOrderId
        ? await ctx.db.get(issue.workOrderId)
        : null;

      // Evidence integrity: each kind may only be filed by the actor who is
      // actually accountable for it, at a stage where it is meaningful. Without
      // this, any signed-in user could forge contractor proof or inspection
      // records on someone else's case.
      switch (args.kind) {
        case "report": {
          if (user.role !== "citizen") {
            throw err.forbidden("Only citizens can add report evidence.");
          }
          if (workOrder && workOrder.status !== "open") {
            throw err.conflict("Work on this case has already started.");
          }
          break;
        }
        case "before":
        case "during":
        case "after": {
          if (user.role !== "contractor") {
            throw err.forbidden(
              "Only contractors can file execution evidence.",
            );
          }
          if (!workOrder) {
            throw err.precondition("No work order exists for this case yet.");
          }
          if (workOrder.contractorId !== user._id) {
            throw err.forbidden(
              "This work order is assigned to another executor.",
            );
          }
          if (
            workOrder.status !== "claimed" &&
            workOrder.status !== "in_progress"
          ) {
            throw err.conflict(
              "Execution evidence is not accepted at this stage.",
            );
          }
          break;
        }
        case "inspection": {
          if (user.role !== "inspector") {
            throw err.forbidden("Only inspectors can file inspection evidence.");
          }
          if (
            !workOrder ||
            (workOrder.status !== "inspection" &&
              workOrder.status !== "completion_submitted")
          ) {
            throw err.conflict("This case is not awaiting inspection.");
          }
          break;
        }
      }

      const now = Date.now();
      const evidenceId = await ctx.db.insert("evidence", {
        issueId: args.issueId,
        userId: user._id,
        kind: args.kind,
        storageId: args.storageId,
        note,
        createdAt: now,
      });

      await ctx.db.patch(args.issueId, {
        evidenceCount: issue.evidenceCount + 1,
        updatedAt: now,
      });

      await logActivity(ctx, {
        issueId: args.issueId,
        actorId: user._id,
        action: "evidence_added",
        message: `${user.name} added ${args.kind} evidence`,
      });

      return evidenceId;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const listForIssue = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    return Promise.all(
      rows.map(async (e) => {
        const user = await ctx.db.get(e.userId);
        return {
          ...e,
          url: await ctx.storage.getUrl(e.storageId),
          userName: user?.name ?? "Unknown",
          userRole: user?.role,
        };
      }),
    );
  },
});
