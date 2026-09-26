/**
 * Fund claims (bank-transfer + screenshot) tests.
 *
 * Covers the full claim lifecycle: submit → approve, submit → reject,
 * duplicate checks, and admin-only gates.
 */

import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  anon,
  as,
  makeUser,
  setup,
  storeImage,
  type Harness,
  type TestUser,
} from "./harness";
import { reachFundingStage } from "./flow";

/* Helpers ------------------------------------------------------------------ */

/** Returns total raised from approved contributions. */
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

/** Returns all claims for an issue with their statuses. */
async function getClaims(t: Harness, issueId: Id<"issues">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("fundClaims")
      .withIndex("by_issue", (q) => q.eq("issueId", issueId))
      .collect(),
  );
}

/* Submit claim -------------------------------------------------------------- */

describe("submitClaim", () => {
  it("allows a citizen to submit a payment claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    const result = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 5000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    expect(result).toHaveProperty("claimId");

    const claims = await getClaims(t, issueId);
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe("pending");
    expect(claims[0].amountCents).toBe(5000);
    expect(claims[0].paymentMethod).toBe("easypaisa");
  });

  it("stores the screenshot reference in the claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "bank_transfer",
      screenshotStorageId: storageId,
    });

    const claims = await getClaims(t, issueId);
    expect(claims[0].screenshotStorageId).toBe(storageId);
  });

  it("rejects claims below the minimum", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await expect(
      as(funder)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 99,
        paymentMethod: "easypaisa",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/minimum/i);
  });

  it("rejects claims above the maximum", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await expect(
      as(funder)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 50001,
        paymentMethod: "jazzcash",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/Maximum/i);
  });

  it("rejects invalid payment methods", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await expect(
      as(funder)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 1000,
        paymentMethod: "credit_card",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/Invalid payment method/i);
  });

  it("blocks duplicate pending claims from the same user", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await expect(
      as(funder)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 2000,
        paymentMethod: "jazzcash",
        screenshotStorageId: await storeImage(t),
      }),
    ).rejects.toThrow(/already have a pending claim/i);
  });

  it("blocks claims on closed cases", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await t.run((ctx) => ctx.db.patch(issueId, { status: "closed" }));

    await expect(
      as(funder)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 1000,
        paymentMethod: "easypaisa",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("blocks non-citizens from submitting claims", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const contractor = await makeUser(t, "contractor");
    const storageId = await storeImage(t);

    await expect(
      as(contractor)(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 1000,
        paymentMethod: "easypaisa",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/citizen/i);
  });

  it("rejects anonymous claims", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const storageId = await storeImage(t);

    await expect(
      anon(t).mutation(api.fund.submitClaim, {
        issueId,
        amountCents: 1000,
        paymentMethod: "easypaisa",
        screenshotStorageId: storageId,
      }),
    ).rejects.toThrow(/sign in/i);
  });

  it("logs the claim submission to activity", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 5000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect(),
    );

    const claimLog = logs.find((l) => l.action === "claim_submitted");
    expect(claimLog).toBeDefined();
    expect(claimLog!.message).toContain(funder.subject);
    expect(claimLog!.message).toContain("claim");
  });
});

/* Approve claim ------------------------------------------------------------ */

describe("approveClaim", () => {
  it("allows an admin to approve a pending claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 5000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.approveClaim, {
      claimId: claimResult.claimId,
      note: "Verified transfer matches amount.",
    });

    // Claim is now approved
    const claims = await getClaims(t, issueId);
    const approvedClaim = claims.find((c) => c._id === claimResult.claimId);
    expect(approvedClaim!.status).toBe("approved");
    expect(approvedClaim!.reviewedAt).toBeDefined();
    expect(approvedClaim!.adminNote).toBe("Verified transfer matches amount.");

    // Contribution row exists
    const state = await getFundState(t, issueId);
    expect(state.totalCents).toBe(5000);
    expect(state.count).toBe(1);
  });

  it("converts the claim into a fund contribution", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 8000,
      paymentMethod: "bank_transfer",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.approveClaim, {
      claimId: claimResult.claimId,
    });

    const state = await getFundState(t, issueId);
    expect(state.totalCents).toBe(8000);
    expect(state.count).toBe(1);
  });

  it("rejects approving a claim that is already reviewed", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.approveClaim, { claimId: claimResult.claimId });

    await expect(
      as(admin)(t).mutation(api.fund.approveClaim, { claimId: claimResult.claimId }),
    ).rejects.toThrow(/already been reviewed/i);
  });

  it("rejects non-admin approval attempts", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const contractor = await makeUser(t, "contractor");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await expect(
      as(contractor)(t).mutation(api.fund.approveClaim, { claimId: claimResult.claimId }),
    ).rejects.toThrow(/administrator/i);
  });

  it("logs approval to activity", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 3000,
      paymentMethod: "jazzcash",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.approveClaim, {
      claimId: claimResult.claimId,
      note: "Looks good.",
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect(),
    );

    const approveLog = logs.find((l) => l.action === "claim_approved");
    expect(approveLog).toBeDefined();
    expect(approveLog!.message).toContain(admin.subject);
    expect(approveLog!.message).toContain("approved");
  });

  it("allows the contractor to claim once enough approved contributions exist", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const contractor = await makeUser(t, "contractor");
    const storageId = await storeImage(t);

    // Fund 80% of the goal via claims
    await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 4000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    const claim = (await getClaims(t, issueId))[0];
    await as(admin)(t).mutation(api.fund.approveClaim, { claimId: claim._id });

    // Now contractor can claim
    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
  });
});

/* Reject claim ------------------------------------------------------------- */

describe("rejectClaim", () => {
  it("allows an admin to reject a pending claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 100,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.rejectClaim, {
      claimId: claimResult.claimId,
      note: "Amount does not match screenshot.",
    });

    const claims = await getClaims(t, issueId);
    const rejectedClaim = claims.find((c) => c._id === claimResult.claimId);
    expect(rejectedClaim!.status).toBe("rejected");
    expect(rejectedClaim!.adminNote).toBe("Amount does not match screenshot.");

    // No contribution created
    const state = await getFundState(t, issueId);
    expect(state.totalCents).toBe(0);
    expect(state.count).toBe(0);
  });

  it("allows the citizen to resubmit after rejection", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId1 = await storeImage(t);
    const storageId2 = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 100,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId1,
    });

    await as(admin)(t).mutation(api.fund.rejectClaim, {
      claimId: claimResult.claimId,
      note: "Wrong amount.",
    });

    // Should be able to submit a new claim
    const result2 = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 5000,
      paymentMethod: "bank_transfer",
      screenshotStorageId: storageId2,
    });
    expect(result2).toHaveProperty("claimId");
  });

  it("rejects non-admin rejection attempts", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const citizen = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await expect(
      as(citizen)(t).mutation(api.fund.rejectClaim, {
        claimId: claimResult.claimId,
        note: "Bad screenshot.",
      }),
    ).rejects.toThrow(/administrator/i);
  });

  it("logs rejection to activity", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.rejectClaim, {
      claimId: claimResult.claimId,
      note: "Does not match.",
    });

    const logs = await t.run(async (ctx) =>
      ctx.db
        .query("activityLogs")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect(),
    );

    const rejectLog = logs.find((l) => l.action === "claim_rejected");
    expect(rejectLog).toBeDefined();
    expect(rejectLog!.message).toContain(admin.subject);
    expect(rejectLog!.message).toContain("rejected");
  });
});

/* getMyClaim query --------------------------------------------------------- */

describe("getMyClaim", () => {
  it("returns 'none' when the user has no claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const other = await makeUser(t, "citizen");

    const result = await as(other)(t).query(api.fund.getMyClaim, { issueId });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("none");
  });

  it("returns 'pending' when the user has a pending claim", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const storageId = await storeImage(t);

    await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 1000,
      paymentMethod: "easypaisa",
      screenshotStorageId: storageId,
    });

    const result = await as(funder)(t).query(api.fund.getMyClaim, { issueId });
    expect(result!.status).toBe("pending");
    expect(result!.amountCents).toBe(1000);
  });

  it("returns 'approved' after admin approves", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 2000,
      paymentMethod: "bank_transfer",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.approveClaim, {
      claimId: claimResult.claimId,
    });

    const result = await as(funder)(t).query(api.fund.getMyClaim, { issueId });
    expect(result!.status).toBe("approved");
    expect(result!.amountCents).toBe(2000);
  });

  it("returns 'rejected' after admin rejects", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);
    const funder = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const storageId = await storeImage(t);

    const claimResult = await as(funder)(t).mutation(api.fund.submitClaim, {
      issueId,
      amountCents: 100,
      paymentMethod: "jazzcash",
      screenshotStorageId: storageId,
    });

    await as(admin)(t).mutation(api.fund.rejectClaim, {
      claimId: claimResult.claimId,
      note: "Too small.",
    });

    const result = await as(funder)(t).query(api.fund.getMyClaim, { issueId });
    expect(result!.status).toBe("rejected");
    expect(result!.amountCents).toBe(100);
  });

  it("returns null for anonymous callers", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachFundingStage(t, reporter);

    const result = await anon(t).query(api.fund.getMyClaim, { issueId });
    expect(result).toBeNull();
  });
});