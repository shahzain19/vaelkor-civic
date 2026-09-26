/**
 * Administration: the `admin` role, and the escalation queue it exists to serve.
 *
 * The tests are ordered by how much damage a regression would do. The first
 * group is the privilege boundary — whether a normal account can become an
 * administrator — because that is the one mistake that would make every other
 * guarantee here worthless. The second group is the ops/oversight split, which
 * is what stops a municipal staff account from being able to wipe the database.
 * The rest is the escalation behaviour itself.
 */

import { describe, expect, it } from "vitest";
import {
  api,
  as,
  anon,
  deletedUserId,
  fileReport,
  makeUser,
  readAll,
  readIssue,
  setup,
  storeImage,
  type Harness,
  type Id,
  type TestUser,
} from "./harness";
import { ALL_CHECKED, reachAwaitingInspection } from "./flow";
import { MAX_INSPECTION_FAILURES } from "../convex/lifecycle";
import { MAX_GRANT } from "../convex/oversight";

/** A checklist that records a genuine failure, with one box unticked. */
const FAILED_CHECKLIST = { ...ALL_CHECKED, requirementsMet: false };

/** Runs `fn` with `subject` on the ops allowlist, restoring it afterwards. */
async function asOps<T>(subject: string, fn: () => Promise<T>) {
  const previous = process.env.ADMIN_CLERK_IDS;
  process.env.ADMIN_CLERK_IDS = subject;
  try {
    return await fn();
  } finally {
    process.env.ADMIN_CLERK_IDS = previous;
  }
}

/** Records a failing decision on a case already sitting in `inspection`. */
async function decideFail(t: Harness, workOrderId: Id<"workOrders">) {
  const inspector = await makeUser(t, "admin");
  await as(inspector)(t).mutation(api.inspections.decide, {
    workOrderId,
    result: "fail",
    checklist: FAILED_CHECKLIST,
  });
}

/** Moves a submitted case into `inspection`, ready for a decision. */
async function beginInspection(t: Harness, workOrderId: Id<"workOrders">) {
  const inspector = await makeUser(t, "admin");
  await as(inspector)(t).mutation(api.inspections.beginInspection, { workOrderId });
}

/** Begins and then fails, consuming one attempt. */
async function failOnce(t: Harness, workOrderId: Id<"workOrders">) {
  await beginInspection(t, workOrderId);
  await decideFail(t, workOrderId);
}

/**
 * Resubmits the work, consuming one inspection attempt.
 *
 * After a failure the case sits in `in_progress` with the same contractor still
 * assigned and their before/after photographs already on file, so the cycle is
 * just a resubmit and an inspection. No re-claim and no new evidence — adding
 * either would be testing a journey the product does not offer.
 */
async function spendAttempt(
  t: Harness,
  workOrderId: Id<"workOrders">,
  contractor: TestUser,
) {
  await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
  await failOnce(t, workOrderId);
}

/**
 * Resubmits, opens an inspection, and asserts the decision is refused.
 *
 * Leaves the case in `inspection` with nothing more the product can do about it,
 * which is the stuck state the queue exists to surface. The budget is checked
 * when the decision is recorded, so the refusal happens on the last step and
 * not on the way in — an implementation that checked earlier would pass this
 * test for the wrong reason only if it also refused to start, which it must not.
 */
async function expectLocked(
  t: Harness,
  workOrderId: Id<"workOrders">,
  contractor: TestUser,
) {
  await as(contractor)(t).mutation(api.workOrders.submitCompletion, { workOrderId });
  await beginInspection(t, workOrderId);
  await expect(decideFail(t, workOrderId)).rejects.toThrow(/administrator/i);
}

/**
 * One case driven until its budget is spent and the next failure is refused.
 *
 * Leaves the case sitting in `inspection` with the decision blocked.
 */
async function exhaustOneCase(t: Harness, reporter: TestUser) {
  const { issueId, workOrderId, contractor } = await reachAwaitingInspection(
    t,
    reporter,
  );

  // Three recorded failures is the whole base allowance.
  await failOnce(t, workOrderId);
  await spendAttempt(t, workOrderId, contractor);
  await spendAttempt(t, workOrderId, contractor);
  await expectLocked(t, workOrderId, contractor);

  return { issueId, workOrderId, contractor };
}

describe("the admin role cannot be self-selected", () => {
  it("refuses a direct call to setRole with admin", async () => {
    const t = setup();
    const user = await makeUser(t, "citizen");

    // The deployment is public: this is callable by anyone with the Convex URL,
    // whatever the onboarding page offers.
    await expect(
      as(user)(t).mutation(api.users.setRole, { role: "admin" }),
    ).rejects.toThrow(/only an operator/i);

    expect((await as(user)(t).query(api.users.me, {}))!.role).toBe("citizen");
  });

  it("refuses it from every civic role, and from an admin", async () => {
    const t = setup();
    for (const role of ["citizen", "contractor", "admin"] as const) {
      const user = await makeUser(t, role);
      await expect(
        as(user)(t).mutation(api.users.setRole, { role: "admin" }),
        role,
      ).rejects.toThrow(/only an operator/i);
    }
  });

  it("refuses whether or not ops access is configured", async () => {
    // The message must not reveal deployment configuration to a signed-in user,
    // so the refusal is identical either way. Asserted so a future "helpfully
    // tell them admin access is not configured" change is caught.
    const t = setup();
    const user = await makeUser(t, "citizen");

    const unset = await as(user)(t)
      .mutation(api.users.setRole, { role: "admin" })
      .catch((e: Error) => e.message);

    await asOps(user.subject, async () => {
      const configured = await as(user)(t)
        .mutation(api.users.setRole, { role: "admin" })
        .catch((e: Error) => e.message);
      expect(configured).toBe(unset);
    });
  });

  it("still lets a person switch freely between the civic roles", async () => {
    const t = setup();
    const user = await makeUser(t, "citizen");
    // Self-selection is a feature for the civic roles, and the guard on `admin`
    // must not have been written in a way that breaks it.
    for (const role of ["contractor", "citizen"] as const) {
      await as(user)(t).mutation(api.users.setRole, { role });
      expect((await as(user)(t).query(api.users.me, {}))!.role).toBe(role);
    }
  });
});

describe("an operator grants the role", () => {
  it("promotes an existing account", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    const subject = await makeUser(t, "citizen");

    const result = await asOps(operator.subject, () =>
      as(operator)(t).mutation(api.admin.grantRole, {
        userId: subject.userId,
        role: "admin",
      }),
    );
    expect(result).toEqual({ previous: "citizen", role: "admin" });
    expect((await as(subject)(t).query(api.users.me, {}))!.role).toBe("admin");
  });

  it("promotes somebody signed in as a citizen with no role yet", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    const fresh = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_fresh",
        name: "Fresh",
        createdAt: Date.now(),
      }),
    );

    await asOps(operator.subject, () =>
      as(operator)(t).mutation(api.admin.grantRole, {
        userId: fresh,
        role: "admin",
      }),
    );
    expect((await as(freshUser(t, fresh))(t).query(api.users.me, {}))!.role).toBe(
      "admin",
    );
  });

  it("demotes an admin back to a civic role", async () => {
    // Revocation has to be possible, or a compromised staff account is permanent.
    const t = setup();
    const operator = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");

    await asOps(operator.subject, () =>
      as(operator)(t).mutation(api.admin.grantRole, {
        userId: admin.userId,
        role: "citizen",
      }),
    );
    expect((await as(admin)(t).query(api.users.me, {}))!.role).toBe("citizen");
  });

  it("refuses when the caller is not on the ops allowlist", async () => {
    const t = setup();
    const stranger = await makeUser(t, "citizen");
    const target = await makeUser(t, "citizen");

    await expect(
      as(stranger)(t).mutation(api.admin.grantRole, {
        userId: target.userId,
        role: "admin",
      }),
    ).rejects.toThrow();
    expect((await as(target)(t).query(api.users.me, {}))!.role).toBe("citizen");
  });

  it("refuses to mint a row for an account that never signed in", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    // A well-formed but already-deleted id: creating a replacement here would
    // mint an identity out of nothing.
    const gone = await deletedUserId(t);

    await asOps(operator.subject, () =>
      expect(
        as(operator)(t).mutation(api.admin.grantRole, {
          userId: gone,
          role: "admin",
        }),
      ).rejects.toThrow(/no longer exists/i),
    );
  });

  it("refuses to let an operator change their own role", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    await asOps(operator.subject, async () => {
      await expect(
        as(operator)(t).mutation(api.admin.grantRole, {
          userId: operator.userId,
          role: "admin",
        }),
      ).rejects.toThrow(/own role/i);
    });
  });
});

describe("oversight is not ops", () => {
  it("refuses the destructive ops functions to an admin role", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const issueId = await fileReport(t, reporter);

    // The separation is the point: `clearAll` deletes the `users` table, so a
    // role-based admin would be deleting its own authority, and a member of
    // municipal staff has no business wiping a live deployment.
    await expect(as(admin)(t).mutation(api.admin.clearAll, {})).rejects.toThrow();
    await expect(
      as(admin)(t).mutation(api.admin.grantRole, {
        userId: reporter.userId,
        role: "admin",
      }),
    ).rejects.toThrow();
    await expect(
      as(admin)(t).query(api.admin.integrityCheck, {}),
    ).rejects.toThrow();

    // Nothing was destroyed. That is the assertion that matters, more than the
    // error text.
    expect(await readIssue(t, issueId)).not.toBeNull();
    expect((await readAll(t, "issues")).length).toBe(1);
  });

  it("refuses the oversight queue to every civic role", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const issueId = await fileReport(t, reporter);

    for (const role of ["citizen", "contractor"] as const) {
      const user = await makeUser(t, role);
      await expect(
        as(user)(t).query(api.oversight.escalatedCases, {}),
        role,
      ).rejects.toThrow(/administrator/i);
      await expect(
        as(user)(t).mutation(api.oversight.grantBudget, { issueId, attempts: 1 }),
        role,
      ).rejects.toThrow(/administrator/i);
    }
  });

  it("refuses the oversight queue to a signed-out visitor", async () => {
    const t = setup();
    await expect(anon(t).query(api.oversight.escalatedCases, {})).rejects.toThrow();
  });

  it("does not give an admin any civic capability", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    // Oversight is not a superuser. An admin cannot file a report, so they
    // cannot pad the ledger or manufacture confirmations.
    await expect(
      as(admin)(t).mutation(api.issues.create, {
        category: "road",
        title: "Administrator reporting",
        description: "Should not be permitted.",
        severity: "low",
        lat: 51.5,
        lng: -0.12,
        address: "1 Example Street",
        storageId: await storeImage(t),
      }),
    ).rejects.toThrow(/citizen/i);
  });
});

describe("the escalation queue", () => {
  it("lists a case that has spent its budget, and nothing else", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");

    // A healthy case that must never appear. Placed elsewhere on the map so the
    // duplicate-report guard does not fire.
    await fileReport(t, reporter, { lat: 40.7, lng: -74 });

    const { issueId } = await exhaustOneCase(t, reporter);

    const queue = await as(admin)(t).query(api.oversight.escalatedCases, {});
    expect(queue).toHaveLength(1);
    expect(queue[0].issueId).toBe(issueId);
    expect(queue[0].failures).toBe(MAX_INSPECTION_FAILURES);
    expect(queue[0].allowance).toBe(MAX_INSPECTION_FAILURES);
    expect(queue[0].granted).toBe(0);
    expect(queue[0].caseNumber).toMatch(/^CIV-/);
    expect(queue[0].lastGrant).toBeNull();
  });

  it("is empty on a healthy database", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    // Already sitting in `inspection` with attempts left, which is precisely the
    // case that must not reach the queue.
    await reachAwaitingInspection(t, reporter);

    expect(await as(admin)(t).query(api.oversight.escalatedCases, {})).toEqual([]);
  });

  it("keeps a granted case visible, with the new allowance", async () => {
    // Leaving it in the queue is deliberate: the next administrator can see the
    // case was already extended rather than granting a second set of attempts.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    await as(admin)(t).mutation(api.oversight.grantBudget, { issueId, attempts: 1 });

    const queue = await as(admin)(t).query(api.oversight.escalatedCases, {});
    expect(queue).toHaveLength(1);
    expect(queue[0].allowance).toBe(MAX_INSPECTION_FAILURES + 1);
    expect(queue[0].granted).toBe(1);
    expect(queue[0].lastGrant).toMatchObject({ attempts: 1 });
  });
});

describe("granting more attempts", () => {
  it("unblocks the case, which can then be failed once more", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId } = await exhaustOneCase(t, reporter);

    const result = await as(admin)(t).mutation(api.oversight.grantBudget, {
      issueId,
      attempts: 1,
    });
    expect(result.allowance).toBe(MAX_INSPECTION_FAILURES + 1);

    // The proof the grant lifted the block: the inspector can now record the
    // decision that was refused a moment ago. No new inspection is started,
    // because the case was already waiting in `inspection`.
    await decideFail(t, workOrderId);
    expect((await readIssue(t, issueId))!.status).toBe("in_progress");
  });

  it("writes the decision onto the case history", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    await as(admin)(t).mutation(api.oversight.grantBudget, {
      issueId,
      attempts: 2,
      note: "Second attempt approved by the ward office.",
    });

    const log = await readAll(t, "activityLogs");
    const entry = log.find((l) => l.action === "budget_granted");
    expect(entry).toBeDefined();
    expect(entry!.issueId).toBe(issueId);
    expect(entry!.actorId).toBe(admin.userId);
    // The reporter reads this, so it has to say what happened in words.
    expect(entry!.message).toMatch(/ward office/i);
    expect(entry!.message).toMatch(/2 more/);
  });

  it("refuses a case that still has attempts left", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachAwaitingInspection(t, reporter);

    await expect(
      as(admin)(t).mutation(api.oversight.grantBudget, { issueId, attempts: 1 }),
    ).rejects.toThrow(/still has attempts/i);
  });

  it("bounds the size of a single grant", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    for (const attempts of [0, -1, 1.5, MAX_GRANT + 1]) {
      await expect(
        as(admin)(t).mutation(api.oversight.grantBudget, { issueId, attempts }),
        `attempts=${attempts}`,
      ).rejects.toThrow();
    }
  });

  it("rejects a note that is present but empty", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    // Treated as absent rather than stored as a blank, so the history never
    // shows a decision with an empty justification.
    await as(admin)(t).mutation(api.oversight.grantBudget, {
      issueId,
      attempts: 1,
      note: "   ",
    });
    const grants = await readAll(t, "budgetGrants");
    expect(grants[0].note).toBeUndefined();
  });

  it("accumulates, so two grants are two recorded decisions", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId, workOrderId, contractor } = await exhaustOneCase(t, reporter);

    const first = await as(admin)(t).mutation(api.oversight.grantBudget, {
      issueId,
      attempts: 1,
    });
    expect(first.allowance).toBe(MAX_INSPECTION_FAILURES + 1);

    // Spend it, which puts the case over its new allowance and stuck again.
    await decideFail(t, workOrderId);
    await expectLocked(t, workOrderId, contractor);

    const second = await as(admin)(t).mutation(api.oversight.grantBudget, {
      issueId,
      attempts: 1,
    });
    expect(second.allowance).toBe(MAX_INSPECTION_FAILURES + 2);

    // Append-only: two grants are two rows, each attributable.
    const grants = (await readAll(t, "budgetGrants")).filter(
      (g) => g.issueId === issueId,
    );
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.attempts)).toEqual([1, 1]);
    expect(grants.every((g) => g.grantedBy === admin.userId)).toBe(true);
  });
});

describe("the audit sees a spent budget", () => {
  it("reports a case waiting on an administrator", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    const violations = await asOps(operator.subject, () =>
      as(operator)(t).query(api.admin.integrityCheck, {}),
    );

    const found = violations.find(
      (v) => v.kind === "inspection_budget_exhausted",
    );
    expect(found).toBeDefined();
    expect(found!.issueId).toBe(issueId);
    expect(found!.detail).toMatch(/waiting on an administrator/i);
  });

  it("stops reporting it once the budget has been extended", async () => {
    const t = setup();
    const operator = await makeUser(t, "citizen");
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await exhaustOneCase(t, reporter);

    await as(admin)(t).mutation(api.oversight.grantBudget, { issueId, attempts: 1 });

    const violations = await asOps(operator.subject, () =>
      as(operator)(t).query(api.admin.integrityCheck, {}),
    );
    expect(
      violations.filter((v) => v.kind === "inspection_budget_exhausted"),
    ).toEqual([]);
  });
});

/* Helpers ------------------------------------------------------------------ */

/** An identity wrapper for a user row created directly, with no fixture. */
function freshUser(t: Harness, userId: Id<"users">): TestUser {
  return { subject: "user_fresh", userId, role: "citizen" };
}
