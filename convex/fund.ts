import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { FUND_CONTRIBUTION, FUND_GOALS, FUND_GOAL_DEFAULT, FUND_GOAL_MAX, PAYMENT_METHODS, formatCents } from "../lib/civic";
import { requireRole, requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";

/**
 * The community fund goal, minted when a work order opens.
 *
 * Called from `createWorkOrderForIssue` in the same mutation that writes the
 * work order, so the goal and the order are one fact. There is no other write
 * path for this table in Phase 1 — the reporter cannot set a goal yet and the
 * administrator cannot adjust one — which means a case either has a fund goal
 * and a work order, or it has neither. The claim gate and the dossier both
 * rely on that being true.
 *
 * The amount is a category default. It is deliberately a separate table from
 * the work order rather than a column on it, so a future reporter override
 * (Phase 4) can record a *proposed* goal on the issue at report time without
 * touching the work order row, and the administrator's adjustment (Phase 2)
 * can be a new row rather than an overwrite — which keeps the history of who
 * changed the target and why.
 */
export async function createFundGoalForIssue(
  ctx: import("./_generated/server").MutationCtx,
  issueId: import("./_generated/dataModel").Id<"issues">,
): Promise<void> {
  const issue = await ctx.db.get(issueId);
  if (!issue) return;
  if (issue.workOrderId === undefined) return;

  const existing = await ctx.db
    .query("fundGoals")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .first();
  if (existing) return;

  await ctx.db.insert("fundGoals", {
    issueId,
    workOrderId: issue.workOrderId,
    targetCents: FUND_GOALS[issue.category] ?? FUND_GOAL_DEFAULT,
    createdAt: Date.now(),
  });
}

export const fund = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) return null;

    const workOrder = issue.workOrderId
      ? await ctx.db.get(issue.workOrderId)
      : null;

    const [goal, contributions] = await Promise.all([
      ctx.db
        .query("fundGoals")
        .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
        .first(),
      ctx.db
        .query("fundContributions")
        .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
        .collect(),
    ]);

    const totalCents = contributions.reduce((s, c) => s + c.amountCents, 0);
    const users = await Promise.all(
      contributions.map((c) => ctx.db.get(c.userId)),
    );

    // Count pending claims for this issue
    const pendingClaims = await ctx.db
      .query("fundClaims")
      .withIndex("by_issue_status", (q) => q.eq("issueId", args.issueId).eq("status", "pending"))
      .collect();

    // Fetch pending claim details with user info
    const pendingClaimsWithUsers = await Promise.all(
      pendingClaims.map(async (claim) => {
        const user = await ctx.db.get(claim.userId);
        return {
          ...claim,
          claimantName: user?.name ?? "Unknown",
        };
      }),
    );

    return {
      goalCents: goal?.targetCents ?? null,
      totalCents,
      contributionsOpen: Boolean(workOrder && workOrder.status === "open"),
      contributions: contributions.map((c, i) => ({
        ...c,
        contributorName: users[i]?.name ?? "Unknown",
      })),
      funderCount: contributions.length,
      pendingClaimCount: pendingClaims.length,
      pendingClaims: pendingClaimsWithUsers,
    };
  },
});

export const contribute = mutation({
  args: {
    issueId: v.id("issues"),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "citizen", "Only citizens can chip in");
    await enforceRateLimit(ctx, "fundContribute", user._id);

    try {
      if (!Number.isInteger(args.amountCents)) {
        throw err.invalid("Contribution must be an integer number of cents.");
      }
      if (args.amountCents < FUND_CONTRIBUTION.min) {
        throw err.invalid(
          `Choose at least ${formatCents(FUND_CONTRIBUTION.min)}.`,
        );
      }
      if (args.amountCents > FUND_CONTRIBUTION.max) {
        throw err.invalid(
          `Maximum contribution is ${formatCents(FUND_CONTRIBUTION.max)}.`,
        );
      }

      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");
      if (issue.status === "closed") {
        throw err.conflict("This case is closed.");
      }

      const workOrder = issue.workOrderId
        ? await ctx.db.get(issue.workOrderId)
        : null;
      if (!workOrder) {
        throw err.precondition(
          "The community fund opens when a work order is created for this case.",
        );
      }
      if (workOrder.status !== "open") {
        throw err.conflict(
          "Contributions are closed once a contractor claims the work.",
        );
      }

      const existing = await ctx.db
        .query("fundContributions")
        .withIndex("by_issue_user", (q) =>
          q.eq("issueId", args.issueId).eq("userId", user._id),
        )
        .unique();
      if (existing) {
        if (existing.amountCents === args.amountCents) {
          return {
            contributionId: existing._id,
            already: true,
            alreadyMessage: "You have already contributed this amount.",
          };
        }
        throw err.conflict("You have already contributed to this case.");
      }

      const now = Date.now();
      const contributionId = await ctx.db.insert("fundContributions", {
        issueId: args.issueId,
        userId: user._id,
        amountCents: args.amountCents,
        createdAt: now,
      });

      await ctx.db.insert("activityLogs", {
        issueId: args.issueId,
        actorId: user._id,
        action: "funded",
        message: `${user.name} contributed ${formatCents(args.amountCents)}.`,
        createdAt: now,
      });

      return {
        contributionId,
        already: false,
      };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Returns the current user's claim status for a specific issue.
 *
 * Used by the case page to show the right UI state without extra round-trips.
 */
/**
 * Lists pending fund claims for admin review.
 *
 * Returns claim rows enriched with the claimant name, the case details, and
 * the work order status so an admin can see at a glance which cases still need
 * their contributions verified.
 */
export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return [];

    const convexUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", user.subject))
      .first();
    if (!convexUser || convexUser.role !== "admin") return [];

    const claims = await ctx.db
      .query("fundClaims")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return Promise.all(
      claims.map(async (claim) => {
        const issue = await ctx.db.get(claim.issueId);
        const workOrder = issue?.workOrderId ? await ctx.db.get(issue.workOrderId) : null;
        const claimant = await ctx.db.get(claim.userId);
        const screenshotUrl = claim.screenshotStorageId
          ? await ctx.storage.getUrl(claim.screenshotStorageId)
          : null;
        return {
          ...claim,
          issueCaseNumber: issue?.caseNumber ?? null,
          issueTitle: issue?.title ?? null,
          issueCategory: issue?.category ?? null,
          issueStatus: issue?.status ?? null,
          workOrderStatus: workOrder?.status ?? null,
          claimantName: claimant?.name ?? "Unknown",
          claimantRole: claimant?.role ?? null,
          screenshotUrl,
        };
      }),
    );
  },
});

export const getMyClaim = query({
  args: { issueId: v.id("issues") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;
    const convexUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", user.subject))
      .first();
    if (!convexUser) return null;

    const approved = await ctx.db
      .query("fundContributions")
      .withIndex("by_issue_user", (q) =>
        q.eq("issueId", args.issueId).eq("userId", convexUser._id),
      )
      .unique();
    if (approved) {
      return { status: "approved" as const, amountCents: approved.amountCents };
    }

    const pending = await ctx.db
      .query("fundClaims")
      .withIndex("by_issue_status", (q) =>
        q.eq("issueId", args.issueId).eq("status", "pending"),
      )
      .collect();
    const myPending = pending.find((c) => c.userId === convexUser._id);
    if (myPending) {
      return { status: "pending" as const, amountCents: myPending.amountCents };
    }

    const rejected = await ctx.db
      .query("fundClaims")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    const myRejected = rejected.find(
      (c) => c.userId === convexUser._id && c.status === "rejected",
    );
    if (myRejected) {
      return { status: "rejected" as const, amountCents: myRejected.amountCents };
    }

    return { status: "none" as const };
  },
});

/* Payment claims ----------------------------------------------------------- */

export const submitClaim = mutation({
  args: {
    issueId: v.id("issues"),
    amountCents: v.number(),
    paymentMethod: v.string(),
    screenshotStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "citizen", "Only citizens can submit payment claims");
    await enforceRateLimit(ctx, "fundContribute", user._id);

    try {
      if (!Number.isInteger(args.amountCents)) {
        throw err.invalid("Claim amount must be a whole number of cents.");
      }
      if (args.amountCents < FUND_CONTRIBUTION.min) {
        throw err.invalid(`Minimum claim is ${formatCents(FUND_CONTRIBUTION.min)}.`);
      }
      if (args.amountCents > FUND_CONTRIBUTION.max) {
        throw err.invalid(`Maximum claim is ${formatCents(FUND_CONTRIBUTION.max)}.`);
      }
      if (!PAYMENT_METHODS.includes(args.paymentMethod as typeof PAYMENT_METHODS[number])) {
        throw err.invalid("Invalid payment method. Choose bank_transfer, easypaisa, or jazzcash.");
      }

      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");
      if (issue.status === "closed") throw err.conflict("This case is closed.");

      const workOrder = issue.workOrderId ? await ctx.db.get(issue.workOrderId) : null;
      if (!workOrder) {
        throw err.precondition("A work order must exist before you can claim a contribution.");
      }
      if (workOrder.status !== "open") {
        throw err.conflict("Contributions are closed once a contractor claims the work.");
      }

      // One pending claim per user per case
      const existing = await ctx.db
        .query("fundClaims")
        .withIndex("by_issue_status", (q) => q.eq("issueId", args.issueId).eq("status", "pending"))
        .collect();
      const myPending = existing.find((c) => c.userId === user._id);
      if (myPending) {
        throw err.conflict("You already have a pending claim for this case. Wait for it to be reviewed.");
      }

      // Also block if already approved
      const approved = await ctx.db
        .query("fundContributions")
        .withIndex("by_issue_user", (q) => q.eq("issueId", args.issueId).eq("userId", user._id))
        .unique();
      if (approved) {
        throw err.conflict("You have already been credited for this case.");
      }

      const now = Date.now();
      const claimId = await ctx.db.insert("fundClaims", {
        issueId: args.issueId,
        userId: user._id,
        amountCents: args.amountCents,
        paymentMethod: args.paymentMethod,
        screenshotStorageId: args.screenshotStorageId,
        status: "pending" as const,
        createdAt: now,
      });

      await ctx.db.insert("activityLogs", {
        issueId: args.issueId,
        actorId: user._id,
        action: "claim_submitted",
        message: `${user.name} submitted a payment claim of ${formatCents(args.amountCents)} — awaiting admin approval.`,
        createdAt: now,
      });

      return { claimId };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const approveClaim = mutation({
  args: {
    claimId: v.id("fundClaims"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin", "Only administrators can approve claims");

    try {
      const claim = await ctx.db.get(args.claimId);
      if (!claim) throw err.notFound("Claim not found.");
      if (claim.status !== "pending") throw err.conflict("This claim has already been reviewed.");

      const now = Date.now();

      // Convert to a real contribution
      await ctx.db.insert("fundContributions", {
        issueId: claim.issueId,
        userId: claim.userId,
        amountCents: claim.amountCents,
        createdAt: now,
      });

      await ctx.db.patch(args.claimId, {
        status: "approved" as const,
        reviewedAt: now,
        reviewerId: admin._id,
        adminNote: args.note,
      });

      const contributor = await ctx.db.get(claim.userId);
      await ctx.db.insert("activityLogs", {
        issueId: claim.issueId,
        actorId: admin._id,
        action: "claim_approved",
        message: `${admin.name} approved ${contributor?.name ?? "a citizen"}'s claim of ${formatCents(claim.amountCents)}.`,
        createdAt: now,
      });

      return { success: true };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const rejectClaim = mutation({
  args: {
    claimId: v.id("fundClaims"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin", "Only administrators can reject claims");

    try {
      const claim = await ctx.db.get(args.claimId);
      if (!claim) throw err.notFound("Claim not found.");
      if (claim.status !== "pending") throw err.conflict("This claim has already been reviewed.");

      const now = Date.now();
      await ctx.db.patch(args.claimId, {
        status: "rejected" as const,
        reviewedAt: now,
        reviewerId: admin._id,
        adminNote: args.note,
      });

      const contributor = await ctx.db.get(claim.userId);
      await ctx.db.insert("activityLogs", {
        issueId: claim.issueId,
        actorId: admin._id,
        action: "claim_rejected",
        message: `${admin.name} rejected ${contributor?.name ?? "a citizen"}'s claim: ${args.note}`,
        createdAt: now,
      });

      return { success: true };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Adjust the community fund goal for a case.
 *
 * Only administrators can call this. The new goal is validated against the
 * contribution limits (it must be a whole number of cents within the min/max
 * range) and a log entry is written so the change is attributable.
 */
export const adjustGoal = mutation({
  args: {
    issueId: v.id("issues"),
    targetCents: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, "admin", "Only administrators can adjust fund goals");

    try {
      if (!Number.isInteger(args.targetCents)) {
        throw err.invalid("Goal must be a whole number of paise (cents).");
      }
      if (args.targetCents < FUND_CONTRIBUTION.min) {
        throw err.invalid(
          `Goal must be at least ${formatCents(FUND_CONTRIBUTION.min)}.`,
        );
      }
      if (args.targetCents > FUND_GOAL_MAX) {
        throw err.invalid(
          `Maximum goal is ${formatCents(FUND_GOAL_MAX)}.`,
        );
      }

      const issue = await ctx.db.get(args.issueId);
      if (!issue) throw err.notFound("That case no longer exists.");

      const workOrder = issue.workOrderId
        ? await ctx.db.get(issue.workOrderId)
        : null;
      if (!workOrder) {
        throw err.precondition(
          "This case does not have an open work order with a fund goal.",
        );
      }
      if (workOrder.status !== "open") {
        throw err.conflict(
          "Fund goals can only be adjusted while the work order is still open.",
        );
      }

      const existing = await ctx.db
        .query("fundGoals")
        .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
        .first();
      if (!existing) {
        throw err.notFound("No fund goal found for this case.");
      }

      const now = Date.now();
      await ctx.db.patch(existing._id, { targetCents: args.targetCents });

      await ctx.db.insert("activityLogs", {
        issueId: args.issueId,
        actorId: admin._id,
        action: "goal_adjusted",
        message: `${admin.name} adjusted the fund goal to ${formatCents(args.targetCents)}.${args.note ? ` Note: "${args.note}"` : ""}`,
        createdAt: now,
      });

      return { goalId: existing._id, targetCents: args.targetCents };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export { err };