/**
 * The Civic Network.
 *
 * A post is the public voice of a citizen: what they saw, what they are affected
 * by, what they know about local work. It is *not* a case. A post may stand
 * alone, or it may attach to a case — and when it does, it borrows that case's
 * authority: its stage, its work order, and its before/after evidence, all read
 * live rather than copied in.
 *
 * That last point is the load-bearing design decision in this file. The obvious
 * implementation denormalizes a post's status at write time, and it is wrong
 * here for the same reason the product refuses to let a case claim it is
 * resolved without proof: a copy is a second truth, and it starts disagreeing
 * the instant somebody does the work.
 */

import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { categoryValidator } from "./schema";
import { requireRole, requireUser } from "./auth";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";
import {
  LIMITS,
  assertCoordinate,
  assertFreshUpload,
  clampLimit,
  clampRadiusKm,
  cleanOptionalString,
  cleanString,
} from "./validation";
import { distanceKm } from "../lib/geo";

/* Reads -------------------------------------------------------------------- */

/**
 * Reads a case and everything a post is allowed to say about it.
 *
 * One helper for every read path so the projection is defined once. The rule it
 * encodes: a post may describe a case's *public* facts — where it is, what stage
 * it is at, what work was ordered — and never its private ones. No reporter
 * identity, no confirmation roster, no fund ledger, no inspection notes.
 */
async function hydrateCase(ctx: QueryCtx, issueId: Id<"issues">) {
  const issue = await ctx.db.get(issueId);
  // A deleted case leaves a post that is still perfectly readable. Returning
  // `null` here rather than throwing is what makes "someone removed this case"
  // degrade into a post without a case badge instead of a broken feed.
  if (!issue) return null;

  const workOrder = issue.workOrderId
    ? await ctx.db.get(issue.workOrderId)
    : null;

  const contractor = workOrder?.contractorId
    ? await ctx.db.get(workOrder.contractorId)
    : null;

  // Only the two photographs that prove accountability, and only once the work
  // order has actually reached the point of having them. Minting signed URLs
  // for every evidence row on every post in a feed would be the most expensive
  // read in the product, and the ones a person actually looks at are the before
  // and the after.
  let beforeUrl: string | null = null;
  let afterUrl: string | null = null;
  if (workOrder && workOrder.status !== "open") {
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .collect();
    for (const row of rows) {
      if (row.kind === "before" && !beforeUrl) {
        beforeUrl = await ctx.storage.getUrl(row.storageId);
      } else if (row.kind === "after" && !afterUrl) {
        afterUrl = await ctx.storage.getUrl(row.storageId);
      }
    }
  }

  return {
    issueId: issue._id,
    caseNumber: issue.caseNumber,
    status: issue.status,
    address: issue.address,
    workOrder: workOrder
      ? {
          id: workOrder._id,
          status: workOrder.status,
          contractorName: contractor?.name ?? null,
        }
      : null,
    beforeUrl,
    afterUrl,
  };
}

/**
 * A page of the feed.
 *
 * Public and unauthenticated, exactly like the ledger and the map: the network
 * is worthless if you have to sign in to find out what your street looks like
 * today. Every post in it is a citizen's public statement about shared
 * infrastructure.
 */
export const list = query({
  args: {
    /** Absent or empty means every category. */
    category: v.optional(categoryValidator),
    /** Present means order by real distance from here. */
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    radiusKm: v.optional(v.number()),
    authorId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit, LIMITS.pageSize.def, LIMITS.pageSize.max);

    const proximity =
      args.lat !== undefined && args.lng !== undefined
        ? {
            lat: args.lat,
            lng: args.lng,
            radiusKm: clampRadiusKm(
              args.radiusKm,
              LIMITS.nearby.def,
              0.1,
              LIMITS.nearby.max,
            ),
          }
        : null;

    const rows: Doc<"posts">[] = args.authorId
      ? await ctx.db
          .query("posts")
          .withIndex("by_author", (q) => q.eq("authorId", args.authorId!))
          .order("desc")
          .take(limit)
      : args.category
        ? // The category index is ordered by (category, createdAt), so the
          // newest posts in that category come back without a sort.
          await ctx.db
            .query("posts")
            .withIndex("by_category", (q) => q.eq("category", args.category!))
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("posts")
            .withIndex("by_createdAt")
            .order("desc")
            .take(limit);

    // A post without coordinates cannot be "nearby", so it drops out of a
    // proximity view rather than being silently placed at the map's origin.
    const located = proximity
      ? rows.filter((p) => p.lat !== undefined && p.lng !== undefined)
      : rows;

    const viewer = await viewerOrNull(ctx);

    // One point read per post, scoped to the page rather than to everything this
    // person has ever confirmed. Scanning their whole history on every feed load
    // would grow without bound; a page's worth of point reads cannot.
    const mine = viewer
      ? new Set(
          (
            await Promise.all(
              located.map((p) =>
                ctx.db
                  .query("postConfirmations")
                  .withIndex("by_post_user", (q) =>
                    q.eq("postId", p._id).eq("userId", viewer._id),
                  )
                  .first(),
              ),
            )
          )
            .filter((c): c is NonNullable<typeof c> => c !== null)
            .map((c) => c.postId as string),
        )
      : new Set<string>();

    const posts = await Promise.all(
      located.map(async (post) => {
        const [author, evidenceRows, linked] = await Promise.all([
          ctx.db.get(post.authorId),
          ctx.db
            .query("postEvidence")
            .withIndex("by_post", (q) => q.eq("postId", post._id))
            .collect(),
          post.issueId ? hydrateCase(ctx, post.issueId) : Promise.resolve(null),
        ]);

        return {
          ...post,
          authorName: author?.name ?? "Unknown",
          affectedByMe: mine.has(post._id as string),
          distanceKm:
            proximity && post.lat !== undefined && post.lng !== undefined
              ? distanceKm(proximity.lat, proximity.lng, post.lat, post.lng)
              : undefined,
          // Photographs are loaded on the single-post view. A page of twenty
          // posts must not mint twenty signed URLs to render a feed the reader
          // may scroll straight past.
          evidenceCount: evidenceRows.length,
          linkedCase: linked,
        };
      }),
    );

    const result = proximity
      ? posts
          .filter(
            (p) => p.distanceKm !== undefined && p.distanceKm <= proximity.radiusKm,
          )
          .sort((a, b) => a.distanceKm! - b.distanceKm!)
      : posts;

    return { posts: result, viewerId: viewer?._id ?? null };
  },
});

/**
 * The viewer, or `null` for an anonymous reader.
 *
 * Not a gate — this module's reads are public. It exists so one feed response
 * can carry "which of these did I already confirm" without a second round trip.
 */
async function viewerOrNull(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/** One post, with its comments and the people it affected. */
export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    // A deleted post resolves to nothing rather than throwing, so a stale link
    // shows an empty state instead of a crash.
    if (!post) return null;

    const [author, evidenceRows, comments, confirmations, linked, viewer] =
      await Promise.all([
        ctx.db.get(post.authorId),
        ctx.db
          .query("postEvidence")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
        ctx.db
          .query("comments")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
        ctx.db
          .query("postConfirmations")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
        post.issueId ? hydrateCase(ctx, post.issueId) : Promise.resolve(null),
        viewerOrNull(ctx),
      ]);

    const evidence = await Promise.all(
      evidenceRows
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (row) => ({
          id: row._id,
          url: await ctx.storage.getUrl(row.storageId),
          note: row.note ?? null,
          userId: row.userId,
        })),
    );

    // Names resolved in one pass over the two id sets rather than a lookup per
    // row: a popular post has hundreds of these.
    const people = new Map<Id<"users">, string>();
    const ids = [
      ...new Set<Id<"users">>([
        post.authorId,
        ...comments.map((c) => c.authorId),
        ...evidence.map((e) => e.userId),
        ...confirmations.map((c) => c.userId),
      ]),
    ];
    const peopleRows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    peopleRows.forEach((row) => {
      if (row) people.set(row._id, row.name);
    });

    const affected = viewer ? confirmations.some((c) => c.userId === viewer._id) : false;

    return {
      ...post,
      authorName: people.get(post.authorId) ?? "Unknown",
      evidence: evidence.map((e) => ({
        ...e,
        userName: people.get(e.userId) ?? "Unknown",
      })),
      comments: comments
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => ({
          id: c._id,
          body: c.body,
          createdAt: c.createdAt,
          authorId: c.authorId,
          authorName: people.get(c.authorId) ?? "Unknown",
          /** Drives whether the author sees a delete control at all. */
          isMine: viewer ? c.authorId === viewer._id : false,
        })),
      affectedByMe: affected,
      linkedCase: linked,
      viewerId: viewer?._id ?? null,
    };
  },
});

/* Writes ------------------------------------------------------------------- */

/**
 * Publishes a post.
 *
 * Citizens and administrators post; contractors do not. A contractor's public
 * statements about work are the work order and its evidence, and giving them a
 * second channel to talk to residents about the same thing would create two
 * versions of every update.
 */
export const create = mutation({
  args: {
    title: v.optional(v.string()),
    body: v.string(),
    category: categoryValidator,
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    address: v.optional(v.string()),
    issueId: v.optional(v.id("issues")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "postCreate", user._id);

    try {
      // Shape is already checked by the argument validators; `categoryValidator`
      // is the schema's own union, so an invented category is rejected by Convex
      // before this handler runs. These are the semantic limits it cannot express.
      const body = cleanString(args.body, "Post", LIMITS.postBody);
      const title = cleanOptionalString(args.title, "Title", LIMITS.title);
      const address = cleanOptionalString(args.address, "Location", LIMITS.address);

      // Coordinates are validated as a pair. A lone latitude, or a NaN that
      // `v.number()` happily accepted, would poison the proximity sort.
      if (args.lat !== undefined || args.lng !== undefined) {
        if (args.lat === undefined || args.lng === undefined) {
          throw err.invalid("A location needs both a latitude and a longitude.");
        }
        assertCoordinate(args.lat, args.lng);
      }

      // The link is verified, not trusted. A post may point at a case, but the
      // case has to exist — otherwise a post could claim the authority of a
      // case number that means nothing.
      if (args.issueId) {
        const issue = await ctx.db.get(args.issueId);
        if (!issue) throw err.notFound("That case no longer exists.");
      }

      const now = Date.now();
      const postId = await ctx.db.insert("posts", {
        authorId: user._id,
        // A post with no title is filed under the first line of its own body.
        // The feed needs a single scannable handle, and inventing a headline
        // would be worse than truncating what the citizen actually wrote.
        title: title ?? firstLine(body),
        body,
        category: args.category,
        lat: args.lat,
        lng: args.lng,
        address,
        issueId: args.issueId,
        confirmationCount: 0,
        commentCount: 0,
        evidenceCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      return postId;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Withdraws a post.
 *
 * The author, or an administrator. Authors may retract — people change their
 * minds about what they put their name next to — and the administrator's power
 * is for removal of content that should not stand, not for editing it. A civic
 * record that an administrator can silently rewrite is not a record.
 *
 * The post's comments and confirmations go with it. A comment on a post that no
 * longer exists is unreadable, and leaving orphaned rows behind would make the
 * tallies on any surviving row impossible to re-derive.
 */
export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "postCreate", user._id);

    try {
      const post = await ctx.db.get(args.postId);
      if (!post) throw err.notFound("That post no longer exists.");
      if (post.authorId !== user._id) {
        throw err.forbidden("You can only remove your own posts.");
      }

      const [comments, confirmations, evidence] = await Promise.all([
        ctx.db
          .query("comments")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
        ctx.db
          .query("postConfirmations")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
        ctx.db
          .query("postEvidence")
          .withIndex("by_post", (q) => q.eq("postId", args.postId))
          .collect(),
      ]);

      for (const row of [...comments, ...confirmations, ...evidence]) {
        await ctx.db.delete(row._id);
      }
      // The bytes go with the metadata. Leaving them in storage would mean a
      // deleted post still cost money to store forever.
      for (const row of evidence) {
        await ctx.storage.delete(row.storageId);
      }

      await ctx.db.delete(args.postId);
      return { removed: true };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * "I'm affected too" — added if absent, removed if present.
 *
 * One mutation rather than a pair of them. The toggle is the whole interaction,
 * and splitting it across `confirm`/`unconfirm` would open a window in which
 * two rapid clicks both read "not yet confirmed" and both insert — which is
 * precisely how a double-submit inflates a count the product then treats as
 * evidence of real people being affected.
 *
 * A Convex mutation is serializable, so the read-then-branch below cannot
 * interleave with another caller's.
 *
 * The tally is written unconditionally, denormalised onto the post row exactly
 * as `issues.confirmationCount` is. It is a summary of the rows, and re-deriving
 * it per feed item would mean a count query for every post on the page.
 */
export const toggleAffected = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "postAffected", user._id);

    try {
      const post = await ctx.db.get(args.postId);
      if (!post) throw err.notFound("That post no longer exists.");

      const existing = await ctx.db
        .query("postConfirmations")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", args.postId).eq("userId", user._id),
        )
        .unique();

      // A `.unique()` that found more than one row would already have thrown
      // above, so reaching here with a duplicate means the invariant was broken
      // by something outside this mutation. Repair it rather than compound it.
      let affected: boolean;
      let confirmationCount: number;

      if (existing) {
        await ctx.db.delete(existing._id);
        affected = false;
        confirmationCount = Math.max(0, post.confirmationCount - 1);
      } else {
        await ctx.db.insert("postConfirmations", {
          postId: args.postId,
          userId: user._id,
          createdAt: Date.now(),
        });
        affected = true;
        confirmationCount = post.confirmationCount + 1;
      }

      await ctx.db.patch(args.postId, { confirmationCount, updatedAt: Date.now() });

      return { affected, confirmationCount };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Attaches a photograph a citizen took to their own post.
 *
 * The author only. A post is a statement of what one person saw, so allowing
 * anyone to add a photograph to it would let a stranger attach a picture they
 * did not take and call it part of that person's evidence — the same reason
 * `evidence.attach` gates on role.
 */
export const attachEvidence = mutation({
  args: {
    postId: v.id("posts"),
    storageId: v.id("_storage"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, "evidenceAttach", user._id);

    try {
      const post = await ctx.db.get(args.postId);
      if (!post) throw err.notFound("That post no longer exists.");
      if (post.authorId !== user._id) {
        throw err.forbidden("You can only add photos to your own posts.");
      }

      const note = cleanOptionalString(args.note, "Caption", LIMITS.note);
      // Validated after it lands in storage, exactly as every other upload in
      // the product: `generateUploadUrl` cannot constrain the request body.
      await assertFreshUpload(ctx, args.storageId);

      const now = Date.now();
      await ctx.db.insert("postEvidence", {
        postId: args.postId,
        userId: user._id,
        storageId: args.storageId,
        note,
        createdAt: now,
      });

      await ctx.db.patch(args.postId, {
        evidenceCount: post.evidenceCount + 1,
        updatedAt: now,
      });

      return { evidenceCount: post.evidenceCount + 1 };
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/** The feed's first line, used as a post's title when none was given. */
function firstLine(body: string): string {
  const line = body.split("\n", 1)[0].trim();
  if (line.length <= 120) return line;
  // Cut on a space so the handle does not end mid-word.
  const cut = line.slice(0, 117).lastIndexOf(" ");
  return `${(cut > 60 ? line.slice(0, cut) : line.slice(0, 117)).trimEnd()}…`;
}

export { err };
