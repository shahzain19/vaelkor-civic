import { describe, expect, it } from "vitest";
import {
  anon,
  api,
  as,
  fileReport,
  makeUser,
  readAll,
  readIssue,
  readWorkOrder,
  setup,
  storeImage,
} from "./harness";
import {
  ALL_CHECKED,
  reachAwaitingInspection,
  reachConfirmed,
  reachVerified,
} from "./flow";
import {
  ISSUE_STATUSES,
  isLegalIssueTransition,
  isLegalWorkOrderTransition,
  type IssueStatus,
  type WorkOrderStatus,
} from "../convex/lifecycle";
import { MAX_INSPECTION_FAILURES } from "../convex/lifecycle";

/**
 * /status
 *
 * The transition table is the contract. These tests assert both directions: the
 * legal path works, and everything outside it is refused.
 */
describe("status: the transition table itself", () => {
  it("declares every status", () => {
    for (const s of ISSUE_STATUSES) {
      expect(typeof isLegalIssueTransition(s, s)).toBe("boolean");
    }
  });

  it("treats a closed case as terminal", () => {
    for (const to of ISSUE_STATUSES) {
      expect(isLegalIssueTransition("closed", to)).toBe(false);
    }
    for (const to of ["open", "claimed", "in_progress", "closed"] as const) {
      expect(isLegalWorkOrderTransition("closed", to)).toBe(false);
    }
  });

  it("never allows a case to skip verification", () => {
    expect(isLegalIssueTransition("reported", "open")).toBe(false);
    expect(isLegalIssueTransition("reported", "claimed")).toBe(false);
    expect(isLegalIssueTransition("reported", "closed")).toBe(false);
    expect(isLegalIssueTransition("confirmed", "closed")).toBe(false);
  });

  it("never allows a case to move backwards to an earlier phase", () => {
    const order: IssueStatus[] = [
      "reported",
      "confirmed",
      "open",
      "claimed",
      "in_progress",
    ];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(isLegalIssueTransition(order[i], order[j])).toBe(false);
      }
    }
  });

  it("allows exactly one failure route out of inspection", () => {
    expect(isLegalIssueTransition("inspection", "closed")).toBe(true);
    expect(isLegalIssueTransition("inspection", "in_progress")).toBe(true);
    expect(isLegalIssueTransition("inspection", "open")).toBe(false);
  });
});

describe("status: the legal path", () => {
  it("walks reported → confirmed → open and creates one work order", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const second = await makeUser(t, "citizen");
    const third = await makeUser(t, "citizen");

    const issueId = await fileReport(t, reporter);
    expect((await readIssue(t, issueId))?.status).toBe("reported");

    await as(second)(t).mutation(api.issues.confirm, { issueId });
    const confirmed = await readIssue(t, issueId);
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.confirmationCount).toBe(2);
    expect(confirmed?.workOrderId).toBeUndefined();

    await as(third)(t).mutation(api.issues.confirm, { issueId });
    const opened = await readIssue(t, issueId);
    expect(opened?.status).toBe("open");
    expect(opened?.confirmationCount).toBe(3);
    expect(opened?.workOrderId).toBeTruthy();

    const orders = await readAll(t, "workOrders");
    expect(orders).toHaveLength(1);
    expect((await readWorkOrder(t, opened!.workOrderId!))?.status).toBe("open");
  });

  it("keeps the case and its work order in step at every hop", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);

    // completion_submitted
    expect((await readIssue(t, issueId))?.status).toBe("completion_submitted");
    expect((await readWorkOrder(t, workOrderId))?.status).toBe(
      "completion_submitted",
    );

    const inspector = await makeUser(t, "admin");
    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    expect((await readIssue(t, issueId))?.status).toBe("inspection");
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("inspection");

    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
    });
    expect((await readIssue(t, issueId))?.status).toBe("closed");
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("closed");
  });
});

describe("status: illegal transitions are refused", () => {
  it("refuses to start work on an order nobody has claimed", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const workOrderId = await reachVerified(t, reporter);
    const contractor = await makeUser(t, "contractor");

    await expect(
      as(contractor)(t).mutation(api.workOrders.start, { workOrderId }),
    ).rejects.toThrow();
  });

  it("refuses completion evidence before the order is claimed", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const workOrderId = await reachVerified(t, reporter);
    const issueId = (await readWorkOrder(t, workOrderId))!.issueId;
    const contractor = await makeUser(t, "contractor");

    await expect(
      as(contractor)(t).mutation(api.evidence.attach, {
        issueId,
        kind: "before",
        storageId: await storeImage(t),
      }),
    ).rejects.toThrow(/assigned to another executor/i);
  });

  it("refuses an inspection decision before completion is submitted", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const workOrderId = await reachVerified(t, reporter);
    const contractor = await makeUser(t, "contractor");
    const inspector = await makeUser(t, "admin");

    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
    // Work claimed, but not performed or evidenced.

    await expect(
      as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "pass",
        checklist: ALL_CHECKED,
      }),
    ).rejects.toThrow(/not awaiting inspection/i);
  });

  it("requires work to be started before completion can be submitted", async () => {
    // Regression: the contractor screen once offered "Submit for inspection"
    // while the order was still `claimed`, so a click landed on this refusal
    // instead of doing anything useful.
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const workOrderId = await reachVerified(t, reporter);
    const issueId = (await readWorkOrder(t, workOrderId))!.issueId;
    const contractor = await makeUser(t, "contractor");

    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
    await as(contractor)(t).mutation(api.evidence.attach, {
      issueId,
      kind: "before",
      storageId: await storeImage(t),
    });
    await as(contractor)(t).mutation(api.evidence.attach, {
      issueId,
      kind: "after",
      storageId: await storeImage(t),
    });

    // Complete proof, but the work was never started.
    await expect(
      as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId }),
    ).rejects.toThrow(/claimed cannot move to completion submitted/i);

    // The refusal left the case exactly where it was.
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("claimed");
    expect((await readIssue(t, issueId))?.status).toBe("claimed");

    // The documented sequence works.
    await as(contractor)(t).mutation(api.workOrders.start, { workOrderId });
    await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("completion_submitted");
  });

  it("refuses a second claim on an already claimed order", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const workOrderId = await reachVerified(t, reporter);
    const first = await makeUser(t, "contractor");
    const second = await makeUser(t, "contractor");

    await as(first)(t).mutation(api.workOrders.accept, { workOrderId });
    await expect(
      as(second)(t).mutation(api.workOrders.accept, { workOrderId }),
    ).rejects.toThrow(/already taken/i);
  });

  it("refuses a second decision on a closed case", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
    });

    // The case is terminal: it can be neither re-opened for inspection nor
    // re-decided, and it stays closed with one resolution.
    await expect(
      as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId }),
    ).rejects.toThrow();
    await expect(
      as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "pass",
        checklist: ALL_CHECKED,
      }),
    ).rejects.toThrow();
    expect(await readAll(t, "resolutions")).toHaveLength(1);
  });

  it("refuses a confirm on a case that already has a work order", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const issueId = await reachConfirmed(t, reporter);
    const third = await makeUser(t, "citizen");

    await as(third)(t).mutation(api.issues.confirm, { issueId });
    expect((await readIssue(t, issueId))?.workOrderId).toBeTruthy();

    const late = await makeUser(t, "citizen");
    await expect(
      as(late)(t).mutation(api.issues.confirm, { issueId }),
    ).rejects.toThrow(/already verified/i);
  });

  it("refuses a duplicate confirmation from the same person", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const issueId = await fileReport(t, reporter);

    // The reporter's own report already counts as their confirmation.
    await expect(
      as(reporter)(t).mutation(api.issues.confirm, { issueId }),
    ).rejects.toThrow(/already confirmed/i);
  });
});

/**
 * Data integrity — the invariant the whole product rests on.
 */
describe("data integrity", () => {
  it("writes a resolution whenever a case closes", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
      notes: "Surface restored and swept.",
    });

    const resolutions = await readAll(t, "resolutions");
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].issueId).toBe(issueId);
    expect(resolutions[0].workOrderId).toBe(workOrderId);
    expect(resolutions[0].notes).toBe("Surface restored and swept.");

    const view = await anon(t).query(api.issues.get, { issueId });
    expect(view?.resolution).not.toBeNull();
  });

  it("refuses to close a case with an incomplete checklist", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    await expect(
      as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "pass",
        checklist: { ...ALL_CHECKED, requirementsMet: false },
      }),
    ).rejects.toThrow(/checklist/i);

    expect((await readIssue(t, (await readWorkOrder(t, workOrderId))!.issueId))?.status)
      .toBe("completion_submitted");
    expect(await readAll(t, "resolutions")).toHaveLength(0);
  });

  it("refuses to close a case whose before/after proof is missing", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    // `submitCompletion` already blocks an incomplete proof set, so to reach
    // the closure guard the evidence must disappear *after* submission. This
    // asserts the invariant is re-checked when the case closes, rather than
    // merely assumed from an earlier state.
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("evidence")
        .withIndex("by_issue", (q) => q.eq("issueId", issueId))
        .collect();
      const after = rows.find((e) => e.kind === "after")!;
      await ctx.db.delete(after._id);
    });

    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await expect(
      as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "pass",
        checklist: ALL_CHECKED,
      }),
    ).rejects.toThrow(/missing before or after photographs/i);

    // The refused close rolls back cleanly: no resolution, case not closed.
    expect(await readAll(t, "resolutions")).toHaveLength(0);
    expect((await readIssue(t, issueId))?.status).toBe("inspection");
  });

  it("returns a case to the contractor on a failed inspection", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "fail",
      checklist: { ...ALL_CHECKED, workPerformed: false },
      notes: "Patch is uneven at the kerb.",
    });

    expect((await readIssue(t, issueId))?.status).toBe("in_progress");
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("in_progress");
    // A failure is not a resolution.
    expect(await readAll(t, "resolutions")).toHaveLength(0);
  });

  it("stops an endless fail/resubmit loop", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId, contractor } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");

    for (let i = 0; i < MAX_INSPECTION_FAILURES; i++) {
      await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
      await as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "fail",
        checklist: { ...ALL_CHECKED, workPerformed: false },
      });

      // The fail sends the case back for rework, never to `closed`.
      expect((await readWorkOrder(t, workOrderId))?.status).toBe("in_progress");
      expect((await readIssue(t, (await readWorkOrder(t, workOrderId))!.issueId))?.status)
        .toBe("in_progress");
      expect(await readAll(t, "resolutions")).toHaveLength(0);

      if (i < MAX_INSPECTION_FAILURES - 1) {
        await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
      }
    }

    // The next fail is over budget: a human has to be pulled in. It still
    // takes a full resubmit + inspect cycle to get there, because that is the
    // only route to a `fail`.
    await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await expect(
      as(inspector)(t).mutation(api.inspections.decide, {
        workOrderId,
        result: "fail",
        checklist: { ...ALL_CHECKED, workPerformed: false },
      }),
    ).rejects.toThrow(/too many times/i);

    // Over-budget refusals do not record a resolution and do not close the case.
    expect(await readAll(t, "resolutions")).toHaveLength(0);
    expect((await readWorkOrder(t, workOrderId))?.status).toBe("inspection");
  });

  it("keeps the denormalised counters equal to the rows they summarise", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const second = await makeUser(t, "citizen");
    const issueId = await fileReport(t, reporter);
    await as(second)(t).mutation(api.issues.confirm, { issueId });

    const issue = await readIssue(t, issueId);
    const confirmations = (await readAll(t, "confirmations")).filter(
      (c) => c.issueId === issueId,
    );
    const evidence = (await readAll(t, "evidence")).filter(
      (e) => e.issueId === issueId,
    );

    expect(issue?.confirmationCount).toBe(confirmations.length);
    expect(issue?.evidenceCount).toBe(evidence.length);
  });
});

/**
 * The audit that makes "this cannot happen" a checked claim.
 */
describe("integrity audit", () => {
  it("reports a clean database after a full workflow", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");
    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
    });

    // Temporarily allowlist the inspector so the audit query can run.
    const previous = process.env.ADMIN_CLERK_IDS;
    process.env.ADMIN_CLERK_IDS = inspector.subject;
    try {
      const violations = await t
        .withIdentity({ subject: inspector.subject })
        .query(api.admin.integrityCheck, {});
      expect(violations).toEqual([]);
    } finally {
      process.env.ADMIN_CLERK_IDS = previous;
    }
  });

  it("detects a case closed with no resolution record", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    await t.run((ctx) => ctx.db.patch(issueId, { status: "closed" }));

    const admin = await makeUser(t, "admin");
    const previous = process.env.ADMIN_CLERK_IDS;
    process.env.ADMIN_CLERK_IDS = admin.subject;
    try {
      const violations = await t
        .withIdentity({ subject: admin.subject })
        .query(api.admin.integrityCheck, {});
      expect(violations.map((v) => v.kind)).toContain("closed_without_resolution");
    } finally {
      process.env.ADMIN_CLERK_IDS = previous;
    }
    void workOrderId;
  });

  it("detects a case whose status and work order disagree", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    // Force the pair out of step.
    await t.run((ctx) => ctx.db.patch(workOrderId, { status: "open" }));

    const admin = await makeUser(t, "admin");
    const previous = process.env.ADMIN_CLERK_IDS;
    process.env.ADMIN_CLERK_IDS = admin.subject;
    try {
      const violations = await t
        .withIdentity({ subject: admin.subject })
        .query(api.admin.integrityCheck, {});
      expect(violations.map((v) => v.kind)).toContain("status_desync");
    } finally {
      process.env.ADMIN_CLERK_IDS = previous;
    }
    void issueId;
  });

  it("detects a second work order on the same case", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, reporter);

    await t.run(async (ctx) => {
      const original = await ctx.db.get(workOrderId);
      await ctx.db.insert("workOrders", {
        issueId: original!.issueId,
        caseNumber: original!.caseNumber,
        scope: [],
        status: "open",
        priority: "low",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const admin = await makeUser(t, "admin");
    const previous = process.env.ADMIN_CLERK_IDS;
    process.env.ADMIN_CLERK_IDS = admin.subject;
    try {
      const violations = await t
        .withIdentity({ subject: admin.subject })
        .query(api.admin.integrityCheck, {});
      expect(violations.map((v) => v.kind)).toContain("duplicate_work_order");
    } finally {
      process.env.ADMIN_CLERK_IDS = previous;
    }
  });
});

/**
 * The lifecycle is the product. This is the test that would catch a regression
 * in the actual user journey.
 */
describe("end-to-end: citizen report to closed case", () => {
  it("carries a report from submission to a resolution the reporter can read", async () => {
    const t = setup();

    // 1. A citizen reports a fault.
    const reporter = await makeUser(t, "citizen", "Reporter");
    const issueId = await fileReport(t, reporter, {
      title: "Sunken trench across the lane",
      description: "Deep trench left by utility works across the northbound lane.",
      severity: "high",
    });
    expect((await readIssue(t, issueId))?.status).toBe("reported");

    // 2. Two neighbours confirm it; the case becomes actionable.
    for (const name of ["Neighbour A", "Neighbour B"]) {
      const neighbour = await makeUser(t, "citizen", name);
      await as(neighbour)(t).mutation(api.issues.confirm, { issueId });
    }
    const verified = await readIssue(t, issueId);
    expect(verified?.status).toBe("open");
    expect(verified?.workOrderId).toBeTruthy();
    const workOrderId = verified!.workOrderId!;

    // 3. It appears on the public board of available work.
    const board = await as(await makeUser(t, "contractor"))(t).query(
      api.workOrders.listAvailable,
      {},
    );
    expect(board.map((w) => w._id)).toContain(workOrderId);

    // 4. A contractor claims it and proves the work.
    const contractor = await makeUser(t, "contractor", "Contractor");
    await as(contractor)(t).mutation(api.workOrders.accept, { workOrderId });
    await as(contractor)(t).mutation(api.workOrders.start, { workOrderId });
    await as(contractor)(t).mutation(api.evidence.attach, {
      issueId,
      kind: "before",
      storageId: await storeImage(t),
    });
    await as(contractor)(t).mutation(api.evidence.attach, {
      issueId,
      kind: "after",
      storageId: await storeImage(t),
    });
    await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
    expect((await readIssue(t, issueId))?.status).toBe("completion_submitted");

    // 5. The case reaches the inspector's queue, marked decidable.
    const inspector = await makeUser(t, "admin", "Inspector");
    const queue = await as(inspector)(t).query(api.inspections.listQueue, {});
    const queued = queue.find((w) => w._id === workOrderId);
    expect(queued).toBeTruthy();
    expect(queued!.evidenceKinds).toEqual(expect.arrayContaining(["before", "after"]));

    // 6. The inspector signs it off.
    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
      notes: "Trench reinstated to standard, surface sound.",
    });

    // 7. The reporter sees a closed case with a recorded resolution.
    const view = await anon(t).query(api.issues.get, { issueId });
    expect(view?.status).toBe("closed");
    expect(view?.resolution?.notes).toBe(
      "Trench reinstated to standard, surface sound.",
    );

    // 8. And it leaves both active queues.
    const finalQueue = await as(inspector)(t).query(api.inspections.listQueue, {});
    expect(finalQueue.map((w) => w._id)).not.toContain(workOrderId);
    const mine = await as(contractor)(t).query(api.workOrders.listMine, {});
    expect(mine.map((w) => w._id)).not.toContain(workOrderId);
  });

  it("shows the reporter a full, ordered history", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen", "Reporter");
    const { issueId, workOrderId } = await reachAwaitingInspection(t, reporter);
    const inspector = await makeUser(t, "admin");
    await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "pass",
      checklist: ALL_CHECKED,
    });

    const view = await anon(t).query(api.issues.get, { issueId });
    const actions = view!.activity.map((a) => a.action);
    expect(actions).toContain("reported");
    expect(actions).toContain("confirmed");
    expect(actions).toContain("work_order_created");
    expect(actions).toContain("claimed");
    expect(actions).toContain("completion_submitted");
    expect(actions).toContain("inspection_passed");

    // Ordered oldest to newest.
    const times = view!.activity.map((a) => a.createdAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

export type { WorkOrderStatus };
