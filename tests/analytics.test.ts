/**
 * Reporting figures.
 *
 * The cases here are driven through the real lifecycle so the counts are the
 * ones the product would actually produce, and the assertions concentrate on
 * the two things that can silently lie: a rate computed against the wrong
 * denominator, and a measure that prints 0 when it has no data at all.
 */

import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import {
  as,
  anon,
  fileReport,
  makeUser,
  setup,
  type Harness,
  type TestUser,
} from "./harness";
import { ALL_CHECKED, closeCase, reachAwaitingInspection } from "./flow";

const DAY = 86_400_000;

/** Files `n` cases at spread-out coordinates so the duplicate guard is happy. */
async function fileMany(t: Harness, reporter: TestUser, n: number) {
  for (let i = 0; i < n; i++) {
    await fileReport(t, reporter, { lat: 10 + i, lng: 20 + i });
  }
}

/**
 * A case driven to `inspection`, reported by a fresh citizen each time.
 *
 * A new reporter per case because the duplicate-report guard is scoped to the
 * reporter, and every case in the workflow helper is filed at the same
 * coordinates.
 */
async function newCase(t: Harness) {
  return reachAwaitingInspection(t, await makeUser(t, "citizen"));
}

describe("reporting is not public", () => {
  it("refuses every report to a civic role", async () => {
    const t = setup();
    for (const role of ["citizen", "contractor"] as const) {
      const user = await makeUser(t, role);
      for (const query of [
        api.analytics.overview,
        api.analytics.byCategory,
        api.analytics.bySeverity,
        api.analytics.weekly,
        api.analytics.inspections,
        api.analytics.statusSpread,
      ]) {
        await expect(as(user)(t).query(query, {}), role).rejects.toThrow(
          /administrator/i,
        );
      }
    }
  });

  it("refuses every report to a signed-out visitor", async () => {
    const t = setup();
    await expect(anon(t).query(api.analytics.overview, {})).rejects.toThrow();
    await expect(anon(t).query(api.analytics.weekly, {})).rejects.toThrow();
  });
});

describe("the overview", () => {
  it("reports an empty ledger as unknown, not as instant", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    const stats = await as(admin)(t).query(api.analytics.overview, {});

    expect(stats.total).toBe(0);
    expect(stats.resolved).toBe(0);
    // The two measures that would otherwise read as a perfect score.
    expect(stats.resolutionRate).toBeNull();
    expect(stats.medianHoursToResolve).toBeNull();
  });

  it("counts by where the case actually is", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");

    // One waiting for confirmations, one being worked on, one resolved.
    await fileMany(t, reporter, 1);
    const open = await newCase(t);
    const resolved = await newCase(t);
    await closeCase(t, resolved.workOrderId);

    const stats = await as(admin)(t).query(api.analytics.overview, {});

    expect(stats.total).toBe(3);
    expect(stats.awaitingConfirmation).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.resolved).toBe(1);
    // 1 resolved of 1 active + 1 resolved. The waiting case is deliberately not
    // in the denominator: it has not been attended, and counting it would make
    // the rate look worse the moment somebody reports something.
    expect(stats.resolutionRate).toBe(0.5);
    expect(open.issueId).not.toBe(resolved.issueId);
  });

  it("takes the median of resolution times, backdated from filing", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    // Both cases are resolved now, then backdated to when they were filed, so
    // the durations are 10 and 30 days and the median has to average them. A
    // mean here would also be 20, which is why the outlier case below matters.
    const quick = await newCase(t);
    await closeCase(t, quick.workOrderId);
    await t.run((ctx) =>
      ctx.db.patch(quick.issueId, { createdAt: Date.now() - 10 * DAY }),
    );

    const slow = await newCase(t);
    await closeCase(t, slow.workOrderId);
    await t.run((ctx) =>
      ctx.db.patch(slow.issueId, { createdAt: Date.now() - 30 * DAY }),
    );

    const stats = await as(admin)(t).query(api.analytics.overview, {});
    expect(stats.resolved).toBe(2);
    // Even count, so the two centre values are averaged: (10 + 30) / 2 = 20 days.
    expect(stats.medianHoursToResolve).toBeCloseTo(20 * 24, 0);
  });

  it("ignores one slow case when measuring the median", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    // Three quick resolutions and one absurd one. The median is unaffected; a
    // mean would report roughly 400 days.
    for (const days of [1, 1, 1]) {
      const c = await newCase(t);
      await closeCase(t, c.workOrderId);
      await t.run((ctx) =>
        ctx.db.patch(c.issueId, { createdAt: Date.now() - days * DAY }),
      );
    }
    const outlier = await newCase(t);
    await closeCase(t, outlier.workOrderId);
    await t.run((ctx) =>
      ctx.db.patch(outlier.issueId, { createdAt: Date.now() - 1200 * DAY }),
    );

    const stats = await as(admin)(t).query(api.analytics.overview, {});
    expect(stats.medianHoursToResolve).toBeCloseTo(24, 0);
  });

  it("counts only the last 30 days as recent", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");

    const old = await fileReport(t, reporter);
    const fresh = await fileReport(t, reporter, { lat: 12, lng: 22 });
    await t.run((ctx) =>
      ctx.db.patch(old, { createdAt: Date.now() - 90 * 86_400_000 }),
    );

    const stats = await as(admin)(t).query(api.analytics.overview, {});
    expect(stats.total).toBe(2);
    expect(stats.last30Days).toBe(1);

    const ids = await t.run(async (ctx) => {
      const issues = await ctx.db.query("issues").collect();
      return issues.map((i) => i._id);
    });
    expect(ids).toContain(fresh);
    expect(ids).toContain(old);
  });
});

describe("the breakdown", () => {
  it("lists every category even at zero", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await fileReport(t, await makeUser(t, "citizen"));

    const rows = await as(admin)(t).query(api.analytics.byCategory, {});
    // Sorted by volume, so the reported category leads.
    expect(rows[0].total).toBe(1);
    expect(rows.map((r) => r.category).sort()).toEqual([
      "drainage",
      "garbage",
      "road",
      "streetlight",
    ]);
    expect(rows.filter((r) => r.total === 0)).toHaveLength(3);
  });

  it("lists every status even at zero", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await fileReport(t, await makeUser(t, "citizen"));

    const rows = await as(admin)(t).query(api.analytics.statusSpread, {});
    expect(rows).toHaveLength(9);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(1);
    expect(rows.find((r) => r.status === "reported")!.total).toBe(1);
    expect(rows.find((r) => r.status === "closed")!.total).toBe(0);
  });

  it("counts a case under the severity it was filed with", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await fileReport(t, await makeUser(t, "citizen"), { severity: "high" });

    const rows = await as(admin)(t).query(api.analytics.bySeverity, {});
    expect(rows.find((r) => r.severity === "high")!.total).toBe(1);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(1);
  });
});

describe("the weekly series", () => {
  it("emits every bucket, including empty ones", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await fileMany(t, await makeUser(t, "citizen"), 1);

    const points = await as(admin)(t).query(api.analytics.weekly, {});
    // A fixed window, so the chart has a stable shape and a quiet fortnight
    // reads as zero rather than as missing data.
    expect(points).toHaveLength(12);
    expect(points.reduce((n, p) => n + p.filed, 0)).toBe(1);
    expect(points[points.length - 1].filed).toBe(1);
    expect([...points].sort((a, b) => a.weekStart - b.weekStart)).toEqual(points);
  });

  it("plots a resolution in the week it happened, not the week reported", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const resolved = await newCase(t);
    await closeCase(t, resolved.workOrderId);

    const points = await as(admin)(t).query(api.analytics.weekly, {});
    expect(points[points.length - 1].resolved).toBe(1);
  });
});

describe("inspection reporting", () => {
  it("reports no data for a pass rate with no decisions", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    const stats = await as(admin)(t).query(api.analytics.inspections, {});
    expect(stats.pass).toBe(0);
    expect(stats.fail).toBe(0);
    // Not 1, which is what an empty sum would divide to.
    expect(stats.passRate).toBeNull();
    expect(stats.casesExtended).toBe(0);
    expect(stats.grants).toBe(0);
  });

  it("counts passes and failures", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");

    const passed = await newCase(t);
    await closeCase(t, passed.workOrderId);

    const failed = await newCase(t);
    const inspector = await makeUser(t, "admin");
    await as(inspector)(t).mutation(api.inspections.beginInspection, {
      workOrderId: failed.workOrderId,
    });
    await as(inspector)(t).mutation(api.inspections.decide, {
      workOrderId: failed.workOrderId,
      result: "fail",
      checklist: { ...ALL_CHECKED, requirementsMet: false },
    });

    const stats = await as(admin)(t).query(api.analytics.inspections, {});
    expect(stats.pass).toBe(1);
    expect(stats.fail).toBe(1);
    expect(stats.passRate).toBe(0.5);
    expect(stats.casesExtended).toBe(0);
  });

  it("counts grants, and counts cases rather than rows", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const first = await newCase(t);
    const second = await newCase(t);

    // Rows are written directly rather than through `grantBudget`, which
    // correctly refuses a case that still has attempts left — driving three real
    // failures to earn one grant is covered in the oversight suite, and this
    // test is only about what the report counts.
    await t.run(async (ctx) => {
      // Two grants on one case and one on another: three rows, two cases.
      for (const issueId of [first.issueId, first.issueId, second.issueId]) {
        await ctx.db.insert("budgetGrants", {
          issueId,
          grantedBy: admin.userId,
          attempts: 1,
          createdAt: Date.now(),
        });
      }
    });

    const stats = await as(admin)(t).query(api.analytics.inspections, {});
    expect(stats.grants).toBe(3);
    // The figure is cases, not grants, so one case extended twice reads as one.
    expect(stats.casesExtended).toBe(2);
  });
});
