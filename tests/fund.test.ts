/**
 * Fund / crowd contribution tests.
 *
 * Covers the full lifecycle: goal creation, contributions, gating, and admin
 * adjustments. Uses the shared harness so every assertion runs against the real
 * Convex functions and an in-memory database.
 */

import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  anon,
  as,
  fileReport,
  makeUser,
  readAll,
  setup,
  storeImage,
  type Harness,
  type TestUser,
} from "./harness";
import { reachConfirmed, reachVerified } from "./flow";
import { FUND_CONTRIBUTION, FUND_GOAL_DEFAULT, FUND_GOALS, FUND_GOAL_MAX, formatCents } from "@/lib/civic";

/* Helpers ------------------------------------------------------------------ */

/** Drives a case to the point where a fund goal exists and contributions can be made. */
async function reachFundingStage(t: Harness, reporter: TestUser): Promise<{ issueId: Id<"issues">; workOrderId: Id<"workOrders"> }> {
  const workOrderId = await reachVerified(t, reporter);
  const issueId = await t.run((ctx) => ctx.db.get(workOrderId).then((w) => w!.issueId));
  return { issueId, workOrderId };
}

/** Returns the current fund goal for an issue. */
async function getGoal(t: Harness, issueId: Id<"issues">): Promise<{ targetCents: number; id: Id<"fundGoals"> } | null> {
  return t.run(async (ctx) => {
    const goal = await ctx.db
      .query("fundGoals")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .first();
    if (!goal) return null;
    return { id: goal._id, targetCents: goal.targetCents };
  });
}

/** Returns total raised and contributor count. */
async function getFundState(t: Harness, issueId: Id<"issues">) {
  return t.run(async (ctx) => {
    const contributions = await ctx.db
      .query("fundContributions")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .collect();
    const totalCents = contributions.reduce((s, c) => s + c.amountCents, 0);
    return { totalCents, count: contributions.length };
  });
}

/* Goal creation ------------------------------------------------------------- */

describe("fund goal creation", () => {
  it("creates a goal when a work order opens", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);

    const goal = await getGoal(t, issueId);
    expect(goal).not.toBeNull();
    expect(goal!.targetCents).toBe(FUND_GOALS["road"] ?? FUND_GOAL_DEFAULT);
    expect(goal!.id).toBeDefined();
  });

  it("uses the category default for the goal amount", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    
    // File a drainage report (higher default goal)
    const storageId = await storeImage(t);
    const issueId = await t
      .withIdentity({ subject: reporter.subject })
      .mutation(api.issues.create, {
        category: "drainage",
        title: "Clogged drain",
        description: "Water pooling on the street.",
        severity: "high",
        lat: 51.5,
        lng: -0.12,
        address: "42 Drain Lane",
        storageId,
      });

    // Confirm to threshold
    const citizen2 = await makeUser(t, "citizen");
    const citizen3 = await makeUser(t, "citizen");
    await as(citizen2)(t).mutation(api.issues.confirm, { issueId });
    await as(citizen3)(t).mutation(api.issues.confirm, { issueId });

    const goal = await getGoal(t, issueId);
    expect(goal!.targetCents).toBe(FUND_GOALS["drainage"]); // 8000 cents = PKR 80
  });

  it("does not create a duplicate goal if one already exists", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachVerified(t, reporter);

    const goals = await readAll(t, "fundGoals");
    expect(goals).toHaveLength(1);
  });
});

/* Contributions ------------------------------------------------------------- */

describe("fund contributions", () => {
  it("allows a citizen to contribute", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 50000, // PKR 500
    });

    const state = await getFundState(t, issueId);
    expect(state.totalCents).toBe(50000);
    expect(state.count).toBe(1);
  });

  it("rejects contributions below the minimum", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await expect(
      as(funder)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: FUND_CONTRIBUTION.min - 1,
      }),
    ).rejects.toThrow(/at least/i);
  });

  it("rejects contributions above the maximum", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await expect(
      as(funder)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: FUND_CONTRIBUTION.max + 1,
      }),
    ).rejects.toThrow(/Maximum/i);
  });

  it("rejects non-integer cent amounts", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await expect(
      as(funder)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: 100.5,
      }),
    ).rejects.toThrow(/integer/i);
  });

  it("prevents duplicate contributions from the same user", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    const result1 = await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 1000,
    });
    expect(result1.already).toBe(false);

    const result2 = await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 1000,
    });
    expect(result2.already).toBe(true);
    expect(result2.alreadyMessage).toContain("already contributed");
  });

  it("allows different users to contribute to the same case", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder1 = await makeUser(t, "citizen");
    const funder2 = await makeUser(t, "citizen");

    await as(funder1)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 5000,
    });
    await as(funder2)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 3000,
    });

    const state = await getFundState(t, issueId);
    expect(state.totalCents).toBe(8000);
    expect(state.count).toBe(2);
  });

  it("blocks contributions once a contractor claims the work", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const contractor = await makeUser(t, "contractor");

    // Contribute enough to meet threshold
    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 5000,
    });

    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });

    await expect(
      as(funder)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: 1000,
      }),
    ).rejects.toThrow(/closed once a contractor/i);
  });

  it("blocks contributions on a closed case", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await t.run((ctx) => ctx.db.patch(issueId, { status: "closed" }));

    await expect(
      as(funder)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: 1000,
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("blocks non-citizens from contributing", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const contractor = await makeUser(t, "contractor");

    await expect(
      as(contractor)(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: 1000,
      }),
    ).rejects.toThrow(/citizen/i);
  });

  it("rejects anonymous contributions", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);

    await expect(
      anon(t).mutation(api.fund.contribute, {
        issueId,
        amountCents: 1000,
      }),
    ).rejects.toThrow(/sign in/i);
  });

  it("logs the contribution to activity logs", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");

    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 5000,
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect()
    );

    const fundLog = logs.find((l) => l.action === "funded");
    expect(fundLog).toBeDefined();
    expect(fundLog!.message).toContain(funder.subject);
    expect(fundLog!.message).toContain("contributed");
  });
});

/* Funding gate for contractors ---------------------------------------------- */

describe("contractor claim funding gate", () => {
  it("allows claiming when 80% of goal is reached", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const contractor = await makeUser(t, "contractor");

    // Road category default is 5000 cents. 80% = 4000 cents.
    const funder = await makeUser(t, "citizen");
    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 4000,
    });

    // Should succeed
    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
  });

  it("blocks claiming when funding threshold not met", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const contractor = await makeUser(t, "contractor");

    // Only contributed 10% of goal
    const funder = await makeUser(t, "citizen");
    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 500,
    });

    await expect(
      as(contractor)(t).mutation(api.workOrders.accept, { workOrderId }),
    ).rejects.toThrow(/requires at least/i);
  });

  it("allows claiming when goal is fully funded", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const contractor = await makeUser(t, "contractor");
    const funder = await makeUser(t, "citizen");

    // Fund the full goal
    const goal = await getGoal(t, issueId);
    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: goal!.targetCents,
    });

    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
  });
});

/* Admin goal adjustment ----------------------------------------------------- */

describe("admin goal adjustment", () => {
  it("allows admin to adjust the fund goal", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");

    const newGoalCents = 100000; // PKR 1000
    await as(admin)(t).mutation(api.fund.adjustGoal, {
      issueId,
      targetCents: newGoalCents,
      note: "Increased due to higher material costs",
    });

    const goal = await getGoal(t, issueId);
    expect(goal!.targetCents).toBe(newGoalCents);
  });

  it("rejects non-admin goal adjustments", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const citizen = await makeUser(t, "citizen");

    await expect(
      as(citizen)(t).mutation(api.fund.adjustGoal, {
        issueId,
        targetCents: 100000,
      }),
    ).rejects.toThrow(/administrator/i);
  });

  it("rejects goal adjustments below minimum", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");

    await expect(
      as(admin)(t).mutation(api.fund.adjustGoal, {
        issueId,
        targetCents: FUND_CONTRIBUTION.min - 1,
      }),
    ).rejects.toThrow(/at least/i);
  });

  it("rejects goal adjustments above maximum (PKR 15,000)", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");

    await expect(
      as(admin)(t).mutation(api.fund.adjustGoal, {
        issueId,
        targetCents: FUND_GOAL_MAX + 1,
      }),
    ).rejects.toThrow(/Maximum goal/i);
  });

  it("logs goal adjustment to activity", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");

    await as(admin)(t).mutation(api.fund.adjustGoal, {
      issueId,
      targetCents: 200000,
      note: "Emergency repair",
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect()
    );

    const adjustLog = logs.find((l) => l.action === "goal_adjusted");
    expect(adjustLog).toBeDefined();
    expect(adjustLog!.message).toContain(admin.subject);
    expect(adjustLog!.message).toContain("adjusted");
  });

  it("blocks adjustment on closed cases", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");

    // Close the work order first
    await t.run((ctx) => ctx.db.patch(workOrderId, { status: "closed" }));

    await expect(
      as(admin)(t).mutation(api.fund.adjustGoal, {
        issueId,
        targetCents: 100000,
      }),
    ).rejects.toThrow(/still open/i);
  });

  it("updates the funding threshold for contractor claims", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const admin = await makeUser(t, "admin");
    const contractor = await makeUser(t, "contractor");

    // Raise goal (but keep within reasonable limits for testing)
    await as(admin)(t).mutation(api.fund.adjustGoal, {
      issueId,
      targetCents: 100000, // PKR 1000
    });

    // Contribute 80% of new goal (split across multiple users to stay under max)
    const funder1 = await makeUser(t, "citizen");
    const funder2 = await makeUser(t, "citizen");
    await as(funder1)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 50000,
    });
    await as(funder2)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 30000, // 80% of 100000
    });

    // Should now be able to claim
    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
  });
});

/* Fund query ---------------------------------------------------------------- */

describe("fund query", () => {
  it("returns null for a non-existent issue", async () => {
    const t = setup();
    const result = await t.run(async (ctx) => {
      const fakeId = (await ctx.db.insert("issues", {
        caseNumber: "CIV-000000",
        category: "road",
        title: "Temp",
        description: "Temp",
        severity: "low",
        status: "reported",
        lat: 0,
        lng: 0,
        address: "Nowhere",
        reporterId: await ctx.db.insert("users", {
          clerkId: "temp",
          name: "Temp",
          role: "citizen",
          createdAt: Date.now(),
        }),
        confirmationCount: 0,
        evidenceCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })) as Id<"issues">;
      await ctx.db.delete(fakeId);
      return fakeId;
    });

    const fund = await anon(t).query(api.fund.fund, { issueId: result });
    expect(fund).toBeNull();
  });

  it("returns correct totals after multiple contributions", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);

    const funder1 = await makeUser(t, "citizen");
    const funder2 = await makeUser(t, "citizen");

    await as(funder1)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 5000,
    });
    await as(funder2)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 3000,
    });

    const fundData = await anon(t).query(api.fund.fund, { issueId });
    expect(fundData).not.toBeNull();
    expect(fundData!.totalCents).toBe(8000);
    expect(fundData!.funderCount).toBe(2);
    expect(fundData!.goalCents).toBe(FUND_GOALS["road"] ?? FUND_GOAL_DEFAULT);
    expect(fundData!.contributionsOpen).toBe(true);
  });

  it("marks contributions as closed once work is claimed", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const contractor = await makeUser(t, "contractor");

    // Contribute enough to meet threshold
    await as(funder)(t).mutation(api.fund.contribute, {
      issueId,
      amountCents: 5000,
    });

    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });

    const fundData = await anon(t).query(api.fund.fund, { issueId });
    expect(fundData!.contributionsOpen).toBe(false);
  });
});