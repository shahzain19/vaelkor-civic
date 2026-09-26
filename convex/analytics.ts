/**
 * Aggregate reporting for the administration dashboard.
 *
 * Every figure here is a count or a duration over the whole ledger. There is no
 * per-user breakdown, no name, no address and no coordinate — an administrator
 * can see how many cases exist and how long they take, and cannot use this
 * surface to read anything about a specific person. That is a deliberate line:
 * oversight is about the queue, and the public ledger already shows case
 * details to anyone who has the case number.
 *
 * Two properties the numbers are chosen to have:
 *
 *  - **Derived, not stored.** A resolution rate is computed from `resolutions`,
 *    which is written in the same mutation that closes a case, so a case cannot
 *    be counted as resolved without a recorded resolution. Nothing here needs a
 *    counter that can drift.
 *  - **Honest about a small ledger.** The median is a median and not a mean,
 *    because a single long-running case must not move the headline figure, and
 *    `null` is returned rather than `0` when there is nothing to take a median
 *    of. A dashboard that shows a confident `0ms` on an empty database is
 *    worse than one that shows nothing.
 */

import { query } from "./_generated/server";
import { requireOversight } from "./auth";
import { CATEGORIES } from "../lib/civic";
import { SEVERITIES, ISSUE_STATUSES } from "./lifecycle";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const HOUR = 60 * 60 * 1000;

/** Rows read per aggregate. Generous for a civic pilot, bounded regardless. */
const SCAN = 20_000;

/** Buckets in the reporting time series. */
const WEEKS = 12;

/**
 * Statuses at which a case has left the reporting queue, meaning somebody
 * other than the original report is now responsible for it.
 */
const ATTENDED = new Set([
  "open",
  "claimed",
  "in_progress",
  "completion_submitted",
  "inspection",
]);

export type Overview = {
  /** Every case ever filed. */
  total: number;
  /** Filed in the last 30 days. */
  last30Days: number;
  /** Still in the `reported` state, waiting for independent confirmations. */
  awaitingConfirmation: number;
  /** Open or in progress, i.e. work that exists but is not finished. */
  active: number;
  /** Resolved, backed by a `resolutions` row. */
  resolved: number;
  /** `resolved / (resolved + active)`, or null when nothing has been attended. */
  resolutionRate: number | null;
  /**
   * Median hours from a case being filed to its resolution.
   *
   * Null when no case has been resolved — not 0, because "no data" and "instant"
   * are different claims.
   */
  medianHoursToResolve: number | null;
};

export type Breakdown = {
  category: string;
  total: number;
  resolved: number;
};

export type SeriesPoint = {
  /** Monday, ms epoch. */
  weekStart: number;
  filed: number;
  resolved: number;
};

export type InspectionStats = {
  pass: number;
  fail: number;
  /** Passes as a share of all decisions, or null when none have been made. */
  passRate: number | null;
  /** Cases an administrator had to unblock, and how many times. */
  casesExtended: number;
  grants: number;
};

export const overview = query({
  args: {},
  handler: async (ctx): Promise<Overview> => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(SCAN);
    const resolutions = await ctx.db.query("resolutions").collect();

    const now = Date.now();
    const recent = now - 30 * DAY;

    let awaitingConfirmation = 0;
    let active = 0;
    let resolved = 0;
    for (const issue of issues) {
      if (issue.status === "reported") awaitingConfirmation++;
      if (ATTENDED.has(issue.status)) active++;
      if (issue.status === "closed") resolved++;
    }

    // Time to resolve is measured against the case's own creation time rather
    // than the resolution's, so a case reported months ago and fixed today
    // reports the months it actually took.
    const filedAt = new Map(issues.map((i) => [i._id, i.createdAt]));
    const durations: number[] = [];
    for (const r of resolutions) {
      const start = filedAt.get(r.issueId);
      if (start === undefined) continue;
      const ms = r.createdAt - start;
      if (ms >= 0) durations.push(ms);
    }
    durations.sort((a, b) => a - b);

    // Explicitly not `median(durations) / HOUR`: null divided by a number is 0,
    // which would report an empty ledger as resolving instantly.
    const medianMs = median(durations);

    return {
      total: issues.length,
      last30Days: issues.filter((i) => i.createdAt >= recent).length,
      awaitingConfirmation,
      active,
      resolved,
      resolutionRate:
        active + resolved === 0 ? null : resolved / (active + resolved),
      medianHoursToResolve: medianMs === null ? null : medianMs / HOUR,
    };
  },
});

export const byCategory = query({
  args: {},
  handler: async (ctx): Promise<Breakdown[]> => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(SCAN);

    const rows = CATEGORIES.map((c) => ({
      category: c.value,
      total: 0,
      resolved: 0,
    }));
    const index = new Map(rows.map((r) => [r.category, r]));

    for (const issue of issues) {
      // A category written before the current list was defined still has to
      // appear rather than silently vanish from the report.
      const row =
        index.get(issue.category) ??
        (() => {
          const extra = { category: issue.category, total: 0, resolved: 0 };
          index.set(issue.category, extra);
          rows.push(extra);
          return extra;
        })();

      row.total++;
      if (issue.status === "closed") row.resolved++;
    }

    return rows.sort((a, b) => b.total - a.total);
  },
});

export const bySeverity = query({
  args: {},
  handler: async (ctx) => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(SCAN);

    return SEVERITIES.map((severity) => ({
      severity,
      total: issues.filter((i) => i.severity === severity).length,
    }));
  },
});

/**
 * Cases filed and cases resolved per week, oldest bucket first.
 *
 * Two series because the interesting question is not "how much did we get" but
 * "is the backlog growing" — and that is only visible when filing and
 * resolution are on the same axis.
 */
export const weekly = query({
  args: {},
  handler: async (ctx): Promise<SeriesPoint[]> => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_createdAt")
      .order("desc")
      .take(SCAN);
    const resolutions = await ctx.db.query("resolutions").collect();

    // Buckets are anchored to the current week and always emitted in full, so
    // the chart has a stable number of points and a gap reads as zero rather
    // than as missing data.
    const thisWeek = startOfWeek(Date.now());
    const buckets: SeriesPoint[] = [];
    const index = new Map<number, SeriesPoint>();
    for (let i = WEEKS - 1; i >= 0; i--) {
      const weekStart = thisWeek - i * WEEK;
      const point = { weekStart, filed: 0, resolved: 0 };
      buckets.push(point);
      index.set(weekStart, point);
    }

    const oldest = thisWeek - (WEEKS - 1) * WEEK;
    for (const issue of issues) {
      const point = index.get(startOfWeek(issue.createdAt));
      if (point && issue.createdAt >= oldest) point.filed++;
    }
    for (const r of resolutions) {
      const point = index.get(startOfWeek(r.createdAt));
      if (point && r.createdAt >= oldest) point.resolved++;
    }

    return buckets;
  },
});

/**
 * Inspection outcomes, and how often a case needed an administrator.
 *
 * The grant count is the number worth watching: it is the only measure of how
 * often the product's own process needed a human to step outside it.
 */
export const inspections = query({
  args: {},
  handler: async (ctx): Promise<InspectionStats> => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const rows = await ctx.db.query("inspections").collect();
    const grants = await ctx.db.query("budgetGrants").collect();

    const pass = rows.filter((r) => r.result === "pass").length;
    const fail = rows.length - pass;

    return {
      pass,
      fail,
      passRate: rows.length === 0 ? null : pass / rows.length,
      casesExtended: new Set(grants.map((g) => g.issueId)).size,
      grants: grants.length,
    };
  },
});

/**
 * Where cases are sitting right now.
 *
 * Every status is listed even at zero, so the board reads as a complete
 * picture of the ledger rather than a list of whatever happens to be populated.
 */
export const statusSpread = query({
  args: {},
  handler: async (ctx) => {
    await requireOversight(ctx, "Only administrators can see reporting.");

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_status")
      .take(SCAN);

    return ISSUE_STATUSES.map((status) => ({
      status,
      total: issues.filter((i) => i.status === status).length,
    }));
  },
});

/* Helpers ------------------------------------------------------------------ */

/**
 * Middle of a sorted list, averaging the two centre values on an even count.
 * Returns null for an empty list, which is the whole reason the caller can
 * distinguish "nothing yet" from "instantly".
 */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Monday 00:00 UTC of the week containing `at`. */
function startOfWeek(at: number): number {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - day,
  );
}
