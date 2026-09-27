/**
 * The fund tier rule.
 *
 * A pure function, so it is tested as one: the matrix below is the whole
 * specification, and every cell is a promise made to a pledger on the case page.
 * The two things worth pinning hardest are that there are only two possible
 * goals, and that drainage is never the cheap one.
 */

import { describe, expect, it } from "vitest";
import {
  FUND_GOAL_TIERS,
  FUND_GOAL_MAX,
  formatCents,
  fundGoalFor,
} from "@/lib/civic";

const CATEGORIES = ["road", "garbage", "drainage", "streetlight"] as const;
const SEVERITIES = ["low", "medium", "high"] as const;

describe("fundGoalFor", () => {
  it("only ever returns one of the two advertised tiers", () => {
    for (const category of CATEGORIES) {
      for (const severity of SEVERITIES) {
        expect([FUND_GOAL_TIERS.standard, FUND_GOAL_TIERS.major]).toContain(
          fundGoalFor(category, severity),
        );
      }
    }
  });

  it("prices drainage as major work at every severity", () => {
    // A collapsed drain is not made cheap by being reported as minor.
    for (const severity of SEVERITIES) {
      expect(fundGoalFor("drainage", severity)).toBe(FUND_GOAL_TIERS.major);
    }
  });

  it("promotes any high-severity case to the major tier", () => {
    for (const category of CATEGORIES) {
      expect(fundGoalFor(category, "high")).toBe(FUND_GOAL_TIERS.major);
    }
  });

  it("leaves everything else on the standard tier", () => {
    for (const category of CATEGORIES) {
      if (category === "drainage") continue;
      for (const severity of ["low", "medium"] as const) {
        expect(fundGoalFor(category, severity)).toBe(FUND_GOAL_TIERS.standard);
      }
    }
  });

  it("falls back to the standard tier for a category it has never seen", () => {
    // The map can grow a category before anyone prices it. An unknown category
    // must still produce a real, claimable goal rather than zero.
    expect(fundGoalFor("sewer_collapse", "low")).toBe(FUND_GOAL_TIERS.standard);
  });

  it("treats an unrecognised severity as not-severe rather than guessing high", () => {
    // Guessing high here would silently inflate every future case's goal.
    expect(fundGoalFor("road", "catastrophic")).toBe(
      FUND_GOAL_TIERS.standard,
    );
  });

  it("is monotonic in severity", () => {
    // Raising a case's severity must never lower what it asks for.
    for (const category of CATEGORIES) {
      const low = fundGoalFor(category, "low");
      const medium = fundGoalFor(category, "medium");
      const high = fundGoalFor(category, "high");
      expect(medium).toBeGreaterThanOrEqual(low);
      expect(high).toBeGreaterThanOrEqual(medium);
    }
  });

  it("stays within the maximum a case is allowed to ask for", () => {
    // `fund.adjustGoal` rejects anything above FUND_GOAL_MAX, so an automatic
    // goal above it would produce a case the admin could never fix.
    for (const category of CATEGORIES) {
      for (const severity of SEVERITIES) {
        expect(fundGoalFor(category, severity)).toBeLessThanOrEqual(
          FUND_GOAL_MAX,
        );
      }
    }
  });

  it("states the tiers in rupees a pledger can check against the page", () => {
    // Guards against someone redefining the tiers in paisa by accident. The
    // case page renders these through `formatCents`, so these two strings are
    // literally what a pledger is shown.
    expect(formatCents(FUND_GOAL_TIERS.standard)).toBe("5000");
    expect(formatCents(FUND_GOAL_TIERS.major)).toBe("10000");
  });
});
