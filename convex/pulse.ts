/**
 * Civic Pulse — what the community is experiencing right now.
 *
 * Every figure here is counted from the rows that exist. Nothing is seeded,
 * estimated, or filled in for effect, and the query is written so that an empty
 * database produces zeros rather than a plausible-looking number: a dashboard
 * that cannot be caught lying is the only kind worth having next to a claim that
 * the ledger cannot be.
 *
 * Counts use `.collect().length` which reads the full index range.
 * This is accurate at pilot volume and ensures the type system is satisfied.
 *
 * Public and unauthenticated. The whole argument of the product is that a
 * resident can see what is happening on their street without asking anyone's
 * permission, and a pulse nobody can read is a private dashboard.
 */

import { query } from "./_generated/server";
import { CATEGORIES } from "../lib/civic";

/**
 * The case states that mean "somebody is doing something about this".
 *
 * `open` is excluded on purpose: the work order exists but no contractor has
 * accepted it, so nothing is happening on the ground. `claimed` onwards is
 * work in flight.
 */
const IN_FLIGHT_WORK_ORDERS = ["claimed", "in_progress", "completion_submitted", "inspection"] as const;

const inFlightSet = new Set<string>(IN_FLIGHT_WORK_ORDERS);

/**
 * The headline figures.
 *
 * `activeCases` is total minus closed rather than a sum over eight "live"
 * states, because eight hand-picked literals is eight chances to leave one out
 * when a state is added — and an "active reports" figure that quietly excludes
 * the newest stage would be wrong in the direction that flatters the product.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    // Get all issues
    const allIssues = await ctx.db.query("issues").collect();
    const total = allIssues.length;
    const closed = allIssues.filter((i) => i.status === "closed").length;

    // Work orders
    const allWorkOrders = await ctx.db.query("workOrders").collect();
    const workOrdersOpen = allWorkOrders.filter((w) => w.status === "open").length;
    const inFlight = allWorkOrders.filter((w) => inFlightSet.has(w.status)).length;

    // Posts, confirmations, comments
    const allPosts = await ctx.db.query("posts").collect();
    const allConfirmations = await ctx.db.query("postConfirmations").collect();
    const allComments = await ctx.db.query("comments").collect();

    return {
      totalCases: total,
      /** Reported and not yet closed. */
      activeCases: Math.max(0, total - closed),
      resolvedCases: closed,
      /** A contractor has accepted and the job is not finished. */
      beingWorkedOn: inFlight,
      /** Work orders written but not yet accepted by anyone. */
      awaitingContractor: workOrdersOpen,
      posts: allPosts.length,
      /** Distinct civic confirmations across the network. */
      affected: allConfirmations.length,
      comments: allComments.length,
    };
  },
});

/**
 * Per-category activity.
 *
 * Every category in `CATEGORIES` is returned, including the ones with no rows,
 * because a bar chart that silently drops empty rows tells a reader that a
 * category does not exist. The UI draws the zeros.
 */
export const byCategory = query({
  args: {},
  handler: async (ctx) => {
    const allIssues = await ctx.db.query("issues").collect();
    const allPosts = await ctx.db.query("posts").collect();

    const rows = CATEGORIES.map((c) => {
      const issuesInCategory = allIssues.filter((i) => i.category === c.value);
      const postsInCategory = allPosts.filter((p) => p.category === c.value);
      const cases = issuesInCategory.length;
      const posts = postsInCategory.length;
      const resolved = issuesInCategory.filter((i) => i.status === "closed").length;
      return { category: c.value, label: c.label, short: c.short, cases, posts, resolved };
    });

    const peak = rows.reduce((max, r) => Math.max(max, r.cases, r.posts), 0);
    return { rows, peak };
  },
});