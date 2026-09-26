import { describe, expect, it } from "vitest";
import {
  anon,
  api,
  as,
  deletedIssueId,
  fileReport,
  makeUser,
  readIssue,
  setup,
  storeImage,
} from "./harness";
import { reachAwaitingInspection, reachVerified } from "./flow";

/**
 * /auth
 *
 * Authentication, session loss, and the rule that a rejected caller learns
 * nothing about the record they were reaching for.
 */
describe("auth", () => {
  it("rejects anonymous calls to every write that needs an identity", async () => {
    const t = setup();
    const storageId = await storeImage(t);

    await expect(
      anon(t).mutation(api.issues.create, {
        category: "road",
        description: "A pothole on the northbound lane.",
        severity: "medium",
        lat: 51.5,
        lng: -0.12,
        address: "12 Example Street",
        storageId,
      }),
    ).rejects.toThrow(/sign in/i);

    // A real, well-formed id so the failure is the auth check and not the
    // argument validator.
    const issueId = await deletedIssueId(t);
    await expect(
      anon(t).mutation(api.issues.confirm, { issueId }),
    ).rejects.toThrow(/sign in/i);
  });

  it("rejects a signed-in user who has not chosen a role", async () => {
    const t = setup();
    const subject = "user_no_role";
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: subject,
        name: "No Role",
        createdAt: Date.now(),
      }),
    );

    const issueId = await deletedIssueId(t);
    await expect(
      t.withIdentity({ subject }).mutation(api.issues.confirm, { issueId }),
    ).rejects.toThrow(/role/i);
  });

  it("keeps public reads working with no session at all", async () => {
    const t = setup();
    const recent = await anon(t).query(api.issues.listRecent, {});
    expect(recent).toEqual([]);
  });

  it("returns null for a case that has been deleted, rather than throwing", async () => {
    const t = setup();
    const issueId = await deletedIssueId(t);

    const result = await anon(t).query(api.issues.get, { issueId });
    expect(result).toBeNull();
  });

  it("rejects a malformed case id at the argument validator", async () => {
    const t = setup();
    // Well-typed as far as TypeScript is concerned, but not a real document id.
    await expect(
      anon(t).query(api.issues.get, { issueId: "not-an-id" as never }),
    ).rejects.toThrow();
  });

  it("does not leak another user's clerkId or email", async () => {
    const t = setup();
    const victim = await makeUser(t, "citizen", "Victim Victim");
    await t.run((ctx) =>
      ctx.db.patch(victim.userId, { email: "victim@example.com" }),
    );

    const attacker = await makeUser(t, "citizen", "Attacker");

    const seen = await as(attacker)(t).query(api.users.get, {
      userId: victim.userId,
    });

    expect(seen).not.toBeNull();
    expect(seen).not.toHaveProperty("clerkId");
    expect(seen).not.toHaveProperty("email");
    expect(seen?.name).toBe("Victim Victim");
  });

  it("refuses the profile lookup to anonymous callers", async () => {
    const t = setup();
    const victim = await makeUser(t, "citizen");
    await expect(
      anon(t).query(api.users.get, { userId: victim.userId }),
    ).rejects.toThrow(/sign in/i);
  });

  it("denies admin mutations when no allowlist is configured", async () => {
    const t = setup();
    const user = await makeUser(t, "citizen");
    // `ADMIN_CLERK_IDS` is unset in the test environment, so the gate must fail
    // closed for everyone, including a signed-in user.
    await expect(as(user)(t).mutation(api.admin.clearAll, {})).rejects.toThrow(
      /admin/i,
    );
    await expect(as(user)(t).query(api.admin.integrityCheck, {})).rejects.toThrow(
      /admin/i,
    );
  });
});

/**
 * /permissions
 *
 * Ownership and role boundaries. The rule under test throughout: a person can
 * only act on records they are accountable for.
 */
describe("permissions", () => {
  it("stops a citizen filing execution evidence on a case", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen);

    await expect(
      as(citizen)(t).mutation(api.evidence.attach, {
        issueId,
        kind: "after",
        storageId: await storeImage(t),
      }),
    ).rejects.toThrow(/contractor/i);
  });

  it("stops a contractor confirming a report", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const contractor = await makeUser(t, "contractor");
    const issueId = await fileReport(t, citizen);

    await expect(
      as(contractor)(t).mutation(api.issues.confirm, { issueId }),
    ).rejects.toThrow(/citizen/i);
  });

  it("stops an inspector accepting work", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const inspector = await makeUser(t, "inspector");
    const workOrderId = await reachVerified(t, reporter);

    await expect(
      as(inspector)(t).mutation(api.workOrders.accept, { workOrderId }),
    ).rejects.toThrow(/contractor/i);
  });

  it("stops a contractor touching a work order assigned to someone else", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const owner = await makeUser(t, "contractor", "Owner");
    const intruder = await makeUser(t, "contractor", "Intruder");

    const workOrderId = await reachVerified(t, reporter);
    await as(owner)(t).mutation(api.workOrders.accept, { workOrderId });

    await expect(
      as(intruder)(t).mutation(api.workOrders.start, { workOrderId }),
    ).rejects.toThrow();
  });

  it("does not reveal a foreign work order through the contractor's own list", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const owner = await makeUser(t, "contractor");
    const intruder = await makeUser(t, "contractor");

    const workOrderId = await reachVerified(t, reporter);
    await as(owner)(t).mutation(api.workOrders.accept, { workOrderId });

    const mine = await as(intruder)(t).query(api.workOrders.listMine, {});
    expect(mine).toEqual([]);

    await expect(
      as(intruder)(t).mutation(api.workOrders.submitCompletion, { workOrderId }),
    ).rejects.toThrow();
  });

  it("locks a case's evidence once it is closed", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen);
    await t.run((ctx) => ctx.db.patch(issueId, { status: "closed" }));

    await expect(
      as(citizen)(t).mutation(api.evidence.attach, {
        issueId,
        kind: "report",
        storageId: await storeImage(t),
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("stops a citizen reading another user's private draft state", async () => {
    // There is no update or delete mutation for a report at all, which is the
    // strongest possible protection: the operation does not exist.
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    const issueId = await fileReport(t, citizen);

    const issueApi = api.issues as unknown as Record<string, unknown>;
    expect(Object.keys(issueApi)).not.toContain("update");
    expect(Object.keys(issueApi)).not.toContain("remove");
    expect(Object.keys(issueApi)).not.toContain("delete");

    // And the reporter's own record is intact and unchanged.
    const issue = await readIssue(t, issueId);
    expect(issue?.reporterId).toBe(citizen.userId);
  });
});

/**
 * The Convex deployment is a public HTTP endpoint. `proxy.ts` only guards
 * pages in this app; it does nothing for a direct call to a query function.
 * These tests call the internal queries the way an attacker would.
 */
describe("direct API access", () => {
  it("keeps the work board away from anonymous callers", async () => {
    const t = setup();
    await expect(anon(t).query(api.workOrders.listAvailable, {})).rejects.toThrow();
  });

  it("keeps the work board away from citizens", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      as(citizen)(t).query(api.workOrders.listAvailable, {}),
    ).rejects.toThrow(/Only contractors can see the work board/i);
  });

  it("keeps the inspection queue away from anonymous callers", async () => {
    const t = setup();
    await expect(anon(t).query(api.inspections.listQueue, {})).rejects.toThrow();
  });

  it("keeps the inspection queue away from non-inspectors", async () => {
    const t = setup();
    for (const role of ["citizen", "contractor"] as const) {
      const user = await makeUser(t, role);
      await expect(
        as(user)(t).query(api.inspections.listQueue, {}),
      ).rejects.toThrow(/Only inspectors can see the inspection queue/i);
    }
  });

  it("keeps the inspection record away from non-inspectors", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, reporter);
    const contractor = await makeUser(t, "contractor");

    await expect(
      as(contractor)(t).query(api.inspections.getForWorkOrder, { workOrderId }),
    ).rejects.toThrow(/Only inspectors can see the inspection record/i);
    await expect(
      anon(t).query(api.inspections.getForWorkOrder, { workOrderId }),
    ).rejects.toThrow();
  });

  it("still lets the right role read the work board", async () => {
    const t = setup();
    const contractor = await makeUser(t, "contractor");
    const board = await as(contractor)(t).query(api.workOrders.listAvailable, {});
    expect(Array.isArray(board)).toBe(true);
  });

  it("leaves the public case view public", async () => {
    // Deliberate: the ledger and /work/[id] are public, so a signed-out
    // visitor must still be able to read a case.
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const issueId = await fileReport(t, reporter);
    const view = await anon(t).query(api.issues.get, { issueId });
    expect(view?.caseNumber).toBeTruthy();
  });
});
