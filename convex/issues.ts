import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { categoryValidator, severityValidator } from "./schema";
import {
  CATEGORY_LABELS,
  CONFIRMATION_THRESHOLD,
  claimIdempotencyKey,
  settleIdempotencyKey,
  createWorkOrderForIssue,
  findDuplicateReport,
  logActivity,
  nextCaseNumber,
} from "./lib";
import { requireRole } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import { transitionLifecycle } from "./lifecycle";
import {
  LIMITS,
  assertCoordinate,
  assertFreshUpload,
  clampLimit,
  clampRadiusKm,
  cleanIdempotencyKey,
  cleanOptionalString,
  cleanString,
} from "./validation";
import { distanceKm } from "../lib/geo";

/* Reads -------------------------------------------------------------------- */

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // A client-supplied `limit` is clamped: `v.number()` happily accepts
    // 1_000_000, and an unbounded `.take()` is a cheap denial-of-service.
    const limit = clampLimit(
      args.limit,
      LIMITS.pageSize.def,
      LIMITS.pageSize.max,
    );

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);

    return Promise.all(
      issues.map(async (issue) => {
        const reporter = await ctx.db.get(issue.reporterId);
        return { ...issue, reporterName: reporter?.name ?? "Unknown" };
      }),
    );
  },
});

/**
 * Issues ordered by real distance from a point.
 *
 * Convex has no geospatial index, so this scans the most recent `scanLimit`
 * issues and filters in JS. Fine at MVP volume; swap for a geo index (or
 * bounding-box prefilter) before running at city scale.
 */
export const listNearby = query({
  args: {
    lat: v.number(),
    lng: v.number(),
    radiusKm: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertCoordinate(args.lat, args.lng);
    const limit = clampLimit(args.limit, LIMITS.nearby.def, LIMITS.nearby.max);
    const radiusKm = clampRadiusKm(
      args.radiusKm,
      LIMITS.nearby.def,
      0.1,
      LIMITS.nearby.scan,
    );
    const scanLimit = LIMITS.nearby.scan;

    const candidates = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(scanLimit);

    const withDistance = candidates
      .map((issue) => ({
        ...issue,
        distanceKm: distanceKm(args.lat, args.lng, issue.lat, issue.lng),
      }))
      .filter((issue) => issue.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return Promise.all(
      withDistance.map(async (issue) => {
        const reporter = await ctx.db.get(issue.reporterId);
        return { ...issue, reporterName: reporter?.name ?? "Unknown" };
      }),
    );
  },
});

export const get = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    // A deleted or malformed id resolves to "no such case" rather than an
    // error, so a stale link shows an empty state instead of a crash.
    if (!issue) return null;

    const [reporter, confirmations, evidenceRows, activity, workOrder] =
      await Promise.all([
        ctx.db.get(issue.reporterId),
        ctx.db
          .query("confirmations")
          .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
          .collect(),
        ctx.db
          .query("evidence")
          .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
          .collect(),
        ctx.db
          .query("activityLogs")
          .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
          .collect(),
        issue.workOrderId ? ctx.db.get(issue.workOrderId) : Promise.resolve(null),
      ]);

    const resolution = await ctx.db
      .query("resolutions")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .first();

    const confirmationUsers = await Promise.all(
      confirmations.map(async (c) => {
        const user = await ctx.db.get(c.userId);
        return {
          ...c,
          userName: user?.name ?? "Unknown",
          userRole: user?.role,
        };
      }),
    );

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

    activity.sort((a, b) => a.createdAt - b.createdAt);
    const activityWithActors = await Promise.all(
      activity.map(async (log) => {
        const actor = log.actorId ? await ctx.db.get(log.actorId) : null;
        return { ...log, actorName: actor?.name };
      }),
    );

    return {
      ...issue,
      reporterName: reporter?.name ?? "Unknown",
      confirmations: confirmationUsers,
      evidence,
      activity: activityWithActors,
      workOrder,
      resolution: resolution
        ? { ...resolution, notes: resolution.notes ?? null }
        : null,
    };
  },
});

/* Writes ------------------------------------------------------------------- */

export const create = mutation({
  args: {
    category: categoryValidator,
    title: v.optional(v.string()),
    description: v.string(),
    severity: severityValidator,
    lat: v.number(),
    lng: v.number(),
    address: v.string(),
    storageId: v.id("_storage"),
    /**
     * Client-generated key so a retried or double-clicked submit resolves to the
     * same case instead of filing two.
     */
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "citizen", "Only citizens can report issues");
    await enforceRateLimit(ctx, "reportCreate", user._id);

    try {
      // Shape is already checked by the argument validators; these are the
      // semantic limits a validator cannot express.
      assertCoordinate(args.lat, args.lng);
      const description = cleanString(
        args.description,
        "Description",
        LIMITS.description,
      );
      const address = cleanString(args.address, "Address", LIMITS.address);
      const title = cleanOptionalString(args.title, "Title", LIMITS.title);

      await assertFreshUpload(ctx, args.storageId);

      const now = Date.now();

      const key = cleanIdempotencyKey(args.idempotencyKey);
      const claim = await claimIdempotencyKey(ctx, key, user._id);
      if (!claim.fresh) {
        // The earlier attempt finished: send the client to the case it made,
        // which is what makes a retry safe rather than merely rejected.
        if (claim.issueId) return claim.issueId;
        // The key exists but has no case yet, so the first attempt is still in
        // flight. Two concurrent writes with one key cannot both be right.
        throw err.conflict(
          "That report is still being submitted. Refresh in a moment to see it.",
        );
      }

      // The same person re-reporting the same fault seconds later is a double
      // click or a retry, not a second case.
      const duplicate = await findDuplicateReport(ctx, {
        reporterId: user._id,
        category: args.category,
        lat: args.lat,
        lng: args.lng,
        now,
      });
      if (duplicate) {
        throw err.conflict(
          `You already reported this at ${humanAge(now - duplicate.createdAt)}. Open case ${duplicate.caseNumber} instead.`,
        );
      }

      const caseNumber = await nextCaseNumber(ctx);
      const resolvedTitle =
        title || CATEGORY_LABELS[args.category] || "Infrastructure issue";

      const issueId = await ctx.db.insert("issues", {
        caseNumber,
        category: args.category,
        title: resolvedTitle,
        description,
        severity: args.severity,
        status: "reported",
        lat: args.lat,
        lng: args.lng,
        address,
        reporterId: user._id,
        // The reporter's own report counts as the first confirmation.
        confirmationCount: 1,
        evidenceCount: 1,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("confirmations", {
        issueId,
        userId: user._id,
        createdAt: now,
      });

      await ctx.db.insert("evidence", {
        issueId,
        userId: user._id,
        kind: "report",
        storageId: args.storageId,
        createdAt: now,
      });

      await logActivity(ctx, {
        issueId,
        actorId: user._id,
        action: "reported",
        message: `${user.name} reported ${caseNumber}: ${resolvedTitle}`,
      });

      await settleIdempotencyKey(ctx, key, user._id, issueId);

      return issueId;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const confirm = mutation({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "citizen", "Only citizens can confirm issues");
    await enforceRateLimit(ctx, "confirm", user._id);

    try {
      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");
      if (issue.status === "closed") {
        throw err.conflict("This case is already closed.");
      }

      // One-way gate. Once a work order exists the case is verified and seeking
      // an executor, so late confirmations must not keep inflating the count.
      if (issue.workOrderId) {
        throw err.conflict("This case is already verified.");
      }

      const existing = await ctx.db
        .query("confirmations")
        .withIndex("by_issue_user", (q) =>
          q.eq("issueId", args.issueId).eq("userId", user._id),
        )
        .unique();
      if (existing) throw err.conflict("You have already confirmed this case.");

      const now = Date.now();
      await ctx.db.insert("confirmations", {
        issueId: args.issueId,
        userId: user._id,
        createdAt: now,
      });

      const confirmationCount = issue.confirmationCount + 1;

      // The counter is written unconditionally. It is a denormalised summary of
      // the confirmation rows, and letting the status transition below own the
      // patch would silently skip this increment on exactly the path that
      // matters most — the one that reaches the threshold.
      await ctx.db.patch(args.issueId, { confirmationCount, updatedAt: now });

      // Second independent confirmation moves `reported` → `confirmed`. This
      // is the only status this mutation may set.
      if (confirmationCount >= 2 && issue.status === "reported") {
        await transitionLifecycle(ctx, {
          issueId: args.issueId,
          to: "confirmed",
          actorId: user._id,
          action: "confirmed",
          message: `${user.name} confirmed the case (${confirmationCount} confirmations)`,
        });
      } else {
        await logActivity(ctx, {
          issueId: args.issueId,
          actorId: user._id,
          action: "confirmed",
          message: `${user.name} confirmed the case (${confirmationCount} confirmations)`,
        });
      }

      if (confirmationCount >= CONFIRMATION_THRESHOLD) {
        await logActivity(ctx, {
          issueId: args.issueId,
          actorId: user._id,
          action: "verified",
          message: `Case verified after ${confirmationCount} confirmations`,
        });
        await createWorkOrderForIssue(ctx, args.issueId, user._id);
      }

      return { confirmationCount };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

function humanAge(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes === 1) return "a minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "an hour ago" : `${hours} hours ago`;
}
