import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import { clampLimit } from "./validation";

/**
 * A recipient's own notifications.
 *
 * Every read is scoped by the authenticated user id taken from the Convex
 * identity, never from an argument. That is the whole authorization story for
 * this module: there is no code path where a caller can name someone else's
 * inbox, so there is no ownership check to get wrong.
 */

/**
 * Ceiling on one page of history.
 *
 * Deliberately not the shared `LIMITS.pageSize` (20/100): the inbox is a
 * scrolling list the user reaches for deliberately, not a server-rendered
 * document, so a longer default is worth the single extra round trip.
 */
const INBOX_PAGE = { def: 30, max: 100 } as const;

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = clampLimit(args.limit, INBOX_PAGE.def, INBOX_PAGE.max);

    const rows = await ctx.db
      .query("notifications")
      // Scoped in the index, not filtered afterwards. An unfiltered
      // `.withIndex("by_user")` walks every recipient's rows in user-id order
      // and applies `.take(limit)` to the *combined* stream, so a user with
      // three notifications gets an empty inbox the moment a busier user
      // exceeds the page size.
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      // The compound index carries `createdAt`, so descending here is a true
      // newest-first ordering rather than an accident of document ids.
      .order("desc")
      .take(limit);

    return rows;
  },
});

/**
 * The unread badge count.
 *
 * A separate query rather than a count on `list`, because the header must not
 * depend on how many notifications the inbox happens to have loaded.
 */
export const unreadCount = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const me = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", me._id).eq("readAt", undefined),
      )
      .collect();
    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await enforceRateLimit(ctx, "notificationRead", me._id);

    try {
      const row = await ctx.db.get(args.notificationId);
      if (!row) throw err.notFound("That notification no longer exists.");
      // Refuse rather than silently no-op: silently succeeding would let a
      // caller believe they had marked a message they cannot see.
      if (row.userId !== me._id) {
        throw err.forbidden("That notification is not yours.");
      }
      if (row.readAt === undefined) {
        await ctx.db.patch(row._id, { readAt: Date.now() });
      }
      return true;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    await enforceRateLimit(ctx, "notificationRead", me._id);

    try {
      const unread = await ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", me._id).eq("readAt", undefined),
        )
        .collect();

      const now = Date.now();
      for (const row of unread) {
        await ctx.db.patch(row._id, { readAt: now });
      }
      return unread.length;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});
