import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOps } from "./auth";
import { err, toSafeError } from "./errors";
import { resetRateLimit, type LimitName } from "./rateLimit";
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
