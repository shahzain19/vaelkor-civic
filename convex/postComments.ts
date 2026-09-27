/**
 * Comments on Civic Network posts.
 *
 * Flat, by design. The goal is useful local information — "this has been broken
 * for three weeks", "same problem extends another 200m", "repair work started
 * this morning" — and a thread tree serves replies-to-replies, which is where
 * civic signal drowns. Every read and write here is scoped to a post id that
 * the caller supplies and the database validates, so a comment can never be
 * read or written against a post it does not belong to.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import { LIMITS, cleanString } from "./validation";

/* Reads -------------------------------------------------------------------- */

/**
 * One post's comments, oldest first.
 *
 * Public, like the post itself. The list is capped well below the page ceiling
 * because a flat list of two hundred comments is not a thing anybody reads, and
 * because a cap is what stops one popular post from becoming the most expensive
 * read on the site.
 */
export const list = query({
  args: {
    postId: v.id("posts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);

    const post = await ctx.db.get(args.postId);
    // Deleted post, no comments. The feed's post list is the source of truth
    // for whether a post exists at all.
    if (!post) return [];

    const rows = await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .take(limit);

    // Names resolved in one batched pass rather than a lookup per comment.
    const ids = [...new Set(rows.map((r) => r.authorId))];
    const people = await Promise.all(ids.map((id) => ctx.db.get(id)));
    const names = new Map(
      people
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => [p._id, p.name] as const),
    );

    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        id: r._id,
        body: r.body,
        createdAt: r.createdAt,
        authorId: r.authorId,
        authorName: names.get(r.authorId) ?? "Unknown",
      }));
  },
});

/* Writes ------------------------------------------------------------------- */

/**
 * Adds a comment.
 *
 * The post is loaded rather than trusted to exist: `ctx.db.insert` with a
 * dangling `postId` would succeed, leaving a comment attached to nothing. This
 * is the same ownership check the rest of the product performs on its targets.
 */
export const add = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "commentCreate", user._id);

    try {
      // A whitespace-only comment is not a comment. `cleanString` trims first
      // and then enforces the window, so `"   "` fails the floor rather than
      // being stored as a blank line.
      const body = cleanString(args.body, "Comment", LIMITS.comment);

      const post = await ctx.db.get(args.postId);
      if (!post) throw err.notFound("That post no longer exists.");

      const now = Date.now();
      const commentId = await ctx.db.insert("comments", {
        postId: args.postId,
        authorId: user._id,
        body,
        createdAt: now,
        updatedAt: now,
      });

      // Denormalised onto the post so the feed can show a comment count without
      // a count query per row. Written unconditionally and in the same mutation
      // as the comment, so the two cannot disagree.
      await ctx.db.patch(args.postId, {
        commentCount: post.commentCount + 1,
        updatedAt: now,
      });

      return { id: commentId };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Removes a comment.
 *
 * The author, or an administrator. Authors may retract what they wrote; the
 * administrator's power is over content that should not stand, not over content
 * that should read differently. An administrator who could quietly edit a
 * resident's statement would be editing the record, which is the one thing this
 * product exists to prevent.
 */
export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "commentCreate", user._id);

    try {
      const comment = await ctx.db.get(args.commentId);
      if (!comment) throw err.notFound("That comment no longer exists.");

      const isModerator = user.role === "admin";
      if (comment.authorId !== user._id && !isModerator) {
        throw err.forbidden("You can only remove your own comments.");
      }

      await ctx.db.delete(args.commentId);

      // The post may itself have been removed, in which case its row is gone and
      // there is no tally left to correct. A missing post is not an error here.
      const post = await ctx.db.get(comment.postId);
      if (post) {
        await ctx.db.patch(comment.postId, {
          commentCount: Math.max(0, post.commentCount - 1),
          updatedAt: Date.now(),
        });
      }

      return { removed: true };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

export { err };
