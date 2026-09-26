/**
 * The notification inbox.
 *
 * Two properties matter more than the rest. First, that a reader can only ever
 * see their own rows — the module's entire authorization story is "the user id
 * comes from the identity, never an argument", and these tests are what hold
 * that in place. Second, that a reader is told about movement on cases they are
 * genuinely party to, and not about their own actions.
 */

import { describe, expect, it } from "vitest";
import {
  api,
  as,
  anon,
  makeUser,
  readAll,
  setup,
  type Harness,
  type TestUser,
} from "./harness";
import { closeCase, reachAwaitingInspection } from "./flow";
import { readWorkOrder } from "./harness";

function inbox(t: Harness, user: TestUser) {
  return as(user)(t).query(api.notifications.list, {});
}

function notificationsFor(t: Harness, user: TestUser) {
  return readAll(t, "notifications").then((rows) =>
    rows.filter((r) => r.userId === user.userId),
  );
}

describe("notification fan-out", () => {
  it("tells the reporter that a contractor claimed their case", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);

    const mine = await notificationsFor(t, reporter);
    const kinds = mine.map((n) => n.kind);
    expect(kinds).toContain("work_claimed");
    expect(kinds).toContain("work_started");
    expect(kinds).toContain("awaiting_inspection");

    // The body has to stand on its own in a list, so it names the case.
    const claimed = mine.find((n) => n.kind === "work_claimed")!;
    expect(claimed.caseNumber).toMatch(/^CIV-/);
    expect(claimed.body).toContain(claimed.caseNumber);
  });

  it("does not notify the actor about their own action", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { contractor } = await reachAwaitingInspection(t, reporter);

    // The contractor performed every step in that journey.
    const theirs = await notificationsFor(t, contractor);
    expect(theirs).toHaveLength(0);
  });

  it("notifies a bystander citizen of nothing", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);
    const bystander = await makeUser(t, "citizen");

    // A citizen who touched nothing has no standing on this case.
    expect(await notificationsFor(t, bystander)).toHaveLength(0);
    expect(await inbox(t, bystander)).toHaveLength(0);
  });

  it("tells the reporter the outcome once an inspector rules", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId, contractor } = await reachAwaitingInspection(
      t,
      reporter,
    );
    const inspector = await closeCase(t, workOrderId);

    // Both the citizen who reported and the contractor who did the work.
    for (const party of [reporter, contractor]) {
      const kinds = (await notificationsFor(t, party)).map((n) => n.kind);
      expect(kinds, party.role).toContain("inspection_passed");
      expect(kinds, party.role).not.toContain("inspection_failed");
    }

    // The inspector made the ruling, so they are not told about it.
    expect(await notificationsFor(t, inspector)).toHaveLength(0);
  });

  it("notifies the worker as well as the reporter on a failure", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { workOrderId, contractor } = await reachAwaitingInspection(
      t,
      reporter,
    );
    const inspector = await makeUser(t, "admin");
    await as(inspector)(t).mutation(api.inspections.beginInspection, {
      workOrderId,
    });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId,
      result: "fail",
      checklist: {
        correctLocation: false,
        workPerformed: false,
        beforeEvidence: true,
        afterEvidence: true,
        requirementsMet: false,
      },
    });

    for (const party of [reporter, contractor]) {
      expect(
        (await notificationsFor(t, party)).map((n) => n.kind),
        party.role,
      ).toContain("inspection_failed");
    }
  });

  it("carries the issue id and case number needed to link through", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    const { issueId } = await reachAwaitingInspection(t, reporter);

    const mine = await notificationsFor(t, reporter);
    expect(mine.length).toBeGreaterThan(0);
    for (const n of mine) {
      expect(n.issueId).toBe(issueId);
      expect(n.caseNumber).toMatch(/^CIV-\d+$/);
    }
  });
});

describe("inbox authorization", () => {
  it("shows a reader their rows even when others have far more", async () => {
    const t = setup();
    // Order matters: the quiet reader's user row is created first, so in a
    // descending index walk the busier recipient's rows are seen first. An
    // unfiltered `.withIndex("by_user")` applies `.take(limit)` to that
    // combined stream, spends the whole page on the other reader, and returns
    // an empty inbox. The fix is an index range on `userId`.
    const quiet = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, quiet);
    const quietRows = await notificationsFor(t, quiet);
    expect(quietRows.length).toBeGreaterThan(0);

    const busy = await makeUser(t, "citizen");
    const { issueId } = { issueId: quietRows[0].issueId };
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("notifications", {
          userId: busy.userId,
          issueId,
          kind: "work_claimed",
          caseNumber: "CIV-999998",
          title: "Noise",
          body: "Noise",
          createdAt: Date.now() + i,
        });
      }
    });

    const quietInbox = await inbox(t, quiet);
    expect(quietInbox).toHaveLength(quietRows.length);
    for (const row of quietInbox) expect(row.userId).toBe(quiet.userId);
  });

  it("orders newest first", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);

    const rows = await inbox(t, reporter);
    const times = rows.map((r) => r.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("refuses to mark somebody else's notification read", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);
    const stranger = await makeUser(t, "citizen");

    const [theirs] = await notificationsFor(t, reporter);

    await expect(
      as(stranger)(t).mutation(api.notifications.markRead, {
        notificationId: theirs._id,
      }),
    ).rejects.toThrow(/not yours/i);

    // Still unread, i.e. the refusal did not half-apply.
    const after = await notificationsFor(t, reporter);
    expect(after.find((n) => n._id === theirs._id)?.readAt).toBeUndefined();
  });

  it("refuses every call from a signed-out visitor", async () => {
    const t = setup();
    await expect(anon(t).query(api.notifications.list, {})).rejects.toThrow();
    await expect(anon(t).query(api.notifications.unreadCount, {})).rejects.toThrow();
    await expect(anon(t).mutation(api.notifications.markAllRead, {})).rejects.toThrow();
  });
});

describe("read state", () => {
  it("marks one read and counts it down", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);

    expect(await as(reporter)(t).query(api.notifications.unreadCount, {})).toBe(
      (await inbox(t, reporter)).length,
    );

    const [first] = await inbox(t, reporter);
    expect(await as(reporter)(t).mutation(api.notifications.markRead, {
      notificationId: first._id,
    })).toBe(true);

    const after = await inbox(t, reporter);
    expect(after.find((r) => r._id === first._id)?.readAt).toBeTypeOf("number");
    expect(await as(reporter)(t).query(api.notifications.unreadCount, {})).toBe(
      (await inbox(t, reporter)).length - 1,
    );
  });

  it("is idempotent, and keeps the original read time", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);
    const [first] = await inbox(t, reporter);

    const reader = as(reporter)(t);
    await reader.mutation(api.notifications.markRead, { notificationId: first._id });
    const stamp = (await notificationsFor(t, reporter)).find(
      (n) => n._id === first._id,
    )!.readAt;

    expect(
      await reader.mutation(api.notifications.markRead, {
        notificationId: first._id,
      }),
    ).toBe(true);
    expect(
      (await notificationsFor(t, reporter)).find((n) => n._id === first._id)!.readAt,
    ).toBe(stamp);
  });

  it("clears the whole inbox and reports how many it touched", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);
    const total = (await inbox(t, reporter)).length;
    expect(total).toBeGreaterThan(1);

    const cleared = await as(reporter)(t).mutation(
      api.notifications.markAllRead,
      {},
    );
    expect(cleared).toBe(total);
    expect(await as(reporter)(t).query(api.notifications.unreadCount, {})).toBe(0);

    // The rows are still there — read, not deleted.
    expect(await inbox(t, reporter)).toHaveLength(total);
  });

  it("leaves another reader's unread count alone", async () => {
    const t = setup();
    const reporter = await makeUser(t, "citizen");
    await reachAwaitingInspection(t, reporter);
    const other = await makeUser(t, "citizen");
    const { workOrderId } = await reachAwaitingInspection(t, other);

    await as(other)(t).mutation(api.notifications.markAllRead, {});
    expect(await as(reporter)(t).query(api.notifications.unreadCount, {})).toBeGreaterThan(0);
    expect(await as(other)(t).query(api.notifications.unreadCount, {})).toBe(0);
    expect(await readWorkOrder(t, workOrderId)).not.toBeNull();
  });
});
