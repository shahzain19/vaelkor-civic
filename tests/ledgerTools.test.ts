/**
 * The two ledger tools on the admin workspace: take the ledger away as CSV, and
 * fill it with a demo batch.
 *
 * Both are reachable by anyone who can read the public Convex URL, so the
 * authorisation tests here matter as much as the happy paths. The seed is an
 * action wrapping an internal mutation, and the interesting failure is the one
 * where the two halves disagree — the mutation has to refuse rather than attach
 * evidence to storage ids that were never written.
 */

import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { as, anon, makeUser, setup, storeImage, type Harness } from "./harness";
import { fundGoalFor } from "@/lib/civic";

/* Helpers ------------------------------------------------------------------ */

/** A filed case, ready to be exported. */
async function fileIssue(
  t: Harness,
  reporter: Awaited<ReturnType<typeof makeUser>>,
  overrides: Partial<{
    title: string;
    description: string;
    address: string;
    category: "road" | "garbage" | "drainage" | "streetlight";
    severity: "low" | "medium" | "high";
    lat: number;
    lng: number;
  }> = {},
): Promise<Id<"issues">> {
  const storageId = await storeImage(t);
  return await as(reporter)(t).mutation(api.issues.create, {
    category: "road",
    title: "Pothole in the northbound lane",
    description: "Deep pothole in the outside lane.",
    severity: "medium",
    lat: 51.5074,
    lng: -0.1278,
    address: "12 Example Street",
    storageId,
    ...overrides,
  });
}

/**
 * Nudges a case east, far enough that a second report is not a duplicate of the
 * first. The nudge is in degrees and has to clear `DUPLICATE_RADIUS_KM`, which
 * `findDuplicateReport` compares against raw degree deltas.
 */
function eastOf(lat: number, n: number) {
  return { lat, lng: -0.1278 + n * 0.05 };
}

/** The rows of an export, parsed, with the response envelope discarded. */
async function rowsOf(t: Harness, admin: Awaited<ReturnType<typeof makeUser>>) {
  const { csv } = await as(admin)(t).query(api.admin_export.exportCsv, {});
  return parseCsv(csv);
}

/** Parses an exported CSV into rows of cells, undoing the quote-doubling. */
function parseCsv(csv: string): string[][] {
  return csv
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (ch === '"') {
            quoted = false;
          } else {
            cell += ch;
          }
        } else if (ch === '"') {
          quoted = true;
        } else if (ch === ",") {
          cells.push(cell);
          cell = "";
        } else {
          cell += ch;
        }
      }
      cells.push(cell);
      return cells;
    });
}

/* Export ------------------------------------------------------------------- */

describe("admin_export.exportCsv", () => {
  it("refuses a signed-out visitor", async () => {
    const t = setup();
    // Unauthenticated is decided before the role is looked at, so this one
    // fails on identity rather than on authority.
    await expect(
      anon(t).query(api.admin_export.exportCsv, {}),
    ).rejects.toThrow(/sign in to continue/i);
  });

  it("refuses every civic role", async () => {
    const t = setup();
    for (const role of ["citizen", "contractor"] as const) {
      const user = await makeUser(t, role);
      await expect(
        as(user)(t).query(api.admin_export.exportCsv, {}),
      ).rejects.toThrow(/administrator/i);
    }
  });

  it("writes a header row and one row per case", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    await fileIssue(t, reporter);
    await fileIssue(t, reporter, {
      title: "Second report",
      ...eastOf(51.5074, 1),
    });

    const rows = await rowsOf(t, admin);
    expect(rows[0]).toContain("Case Number");
    expect(rows[0]).toContain("Reporter");
    expect(rows).toHaveLength(3);
  });

  it("exports only the header when the ledger is empty", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const rows = await rowsOf(t, admin);
    expect(rows).toHaveLength(1);
  });

  it("round-trips commas, quotes and newlines in free text", async () => {
    // A title with a comma in it must not shift every later cell by one.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    await fileIssue(t, reporter, {
      title: 'Pothole, "deep" and flooding',
      description: "Line one, line two",
    });

    const rows = await rowsOf(t, admin);
    // The embedded comma would push Title one cell right if it were not quoted.
    expect(rows[0].indexOf("Title")).toBe(rows[0].indexOf("Category") + 1);
    expect(rows[1][2]).toBe('Pothole, "deep" and flooding');
    expect(rows[1][3]).toBe("Line one, line two");
  });

  it("carries the reporter's name but not their clerk id or email", async () => {
    // The export is for offline analysis, so it must stay a ledger and not
    // become a contact list.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen", "Ayesha Khan");
    await fileIssue(t, reporter);

    const { csv } = await as(admin)(t).query(api.admin_export.exportCsv, {});
    expect(csv).toContain("Ayesha Khan");
    expect(csv).not.toContain(reporter.subject);
  });

  it("says how many rows it wrote", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    await fileIssue(t, reporter);
    await fileIssue(t, reporter, { ...eastOf(51.5074, 1) });

    const result = await as(admin)(t).query(api.admin_export.exportCsv, {});
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("declares a short export rather than handing over a partial file quietly", async () => {
    // The cap exists so one query cannot take the function down. Reporting it
    // is what stops an administrator reading a truncated file as the whole
    // ledger. This seeds rows directly, since filing 5,001 cases through the
    // real path would take minutes and prove nothing extra.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");

    await t.run(async (ctx) => {
      for (let i = 0; i < 5001; i++) {
        await ctx.db.insert("issues", {
          caseNumber: `CIV-${String(i).padStart(6, "0")}`,
          category: "road",
          title: `Bulk case ${i}`,
          description: "Seeded for the cap test.",
          severity: "medium",
          status: "reported",
          lat: 51.5 + i * 0.0001,
          lng: -0.12,
          address: "Bulk Lane",
          reporterId: reporter.userId,
          confirmationCount: 0,
          evidenceCount: 0,
          createdAt: 1_700_000_000_000 + i,
          updatedAt: 1_700_000_000_000 + i,
        });
      }
    });

    const result = await as(admin)(t).query(api.admin_export.exportCsv, {});
    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(5000);
    // Header plus exactly the cap, and not one more.
    expect(parseCsv(result.csv)).toHaveLength(5001);
  });

  it("labels a case whose reporter row is gone rather than dropping it", async () => {
    // The ledger is the record. A dangling reporter must not delete a case from
    // the export.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const reporter = await makeUser(t, "citizen");
    const issueId = await fileIssue(t, reporter);
    await t.run((ctx) => ctx.db.delete(reporter.userId));

    const rows = await rowsOf(t, admin);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("Unknown");
    expect(rows[1][0]).toBe(
      await t.run(async (ctx) => (await ctx.db.get(issueId))!.caseNumber),
    );
  });
});

/* Seed --------------------------------------------------------------------- */

describe("admin_demo.seedDemoData", () => {
  it("refuses a signed-out visitor", async () => {
    const t = setup();
    await expect(
      anon(t).action(api.admin_demo.seedDemoData, {}),
    ).rejects.toThrow(/sign in to continue/i);
  });

  it("refuses every civic role", async () => {
    const t = setup();
    for (const role of ["citizen", "contractor"] as const) {
      const user = await makeUser(t, role);
      await expect(
        as(user)(t).action(api.admin_demo.seedDemoData, {}),
      ).rejects.toThrow(/administrator/i);
    }
  });

  it("writes no cases when the caller is not an administrator", async () => {
    // The authorisation runs before any storage write, so a refused seed must
    // leave the ledger exactly as it found it.
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      as(citizen)(t).action(api.admin_demo.seedDemoData, {}),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("issues").collect())).toHaveLength(0);
  });

  it("builds a batch spanning the lifecycle", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    const result = await as(admin)(t).action(api.admin_demo.seedDemoData, {});

    expect(result.issuesCreated).toBe(7);
    expect(result.issueIds).toHaveLength(7);

    const statuses = await t.run(async (ctx) => {
      const issues = await ctx.db.query("issues").collect();
      return issues.map((i) => i.status).sort();
    });
    expect(new Set(statuses).size).toBeGreaterThan(1);
  });

  it("gives every seeded case a case number and a reporter", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await as(admin)(t).action(api.admin_demo.seedDemoData, {});

    const issues = await t.run((ctx) => ctx.db.query("issues").collect());
    for (const issue of issues) {
      expect(issue.caseNumber).toMatch(/^CIV-/);
      expect(issue.reporterId).toBeDefined();
    }
  });

  it("attaches evidence that resolves to a stored file", async () => {
    // The bug this guards: storage ids minted by the action, evidence rows
    // written by the mutation. If the two halves drift, evidence points at
    // nothing and every demo case renders a broken image.
    const t = setup();
    const admin = await makeUser(t, "admin");
    await as(admin)(t).action(api.admin_demo.seedDemoData, {});

    const evidence = await t.run((ctx) => ctx.db.query("evidence").collect());
    expect(evidence.length).toBeGreaterThan(0);
    for (const row of evidence) {
      const url = await t.run((ctx) => ctx.storage.getUrl(row.storageId));
      expect(url).toBeTruthy();
    }
  });

  it("prices each work order by the case's own tier", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await as(admin)(t).action(api.admin_demo.seedDemoData, {});

    const mismatched = await t.run(async (ctx) => {
      const goals = await ctx.db.query("fundGoals").collect();
      const wrong: string[] = [];
      for (const goal of goals) {
        const issue = await ctx.db.get(goal.issueId);
        if (!issue) continue;
        if (goal.targetCents !== fundGoalFor(issue.category, issue.severity)) {
          wrong.push(issue.caseNumber);
        }
      }
      return wrong;
    });
    expect(mismatched).toEqual([]);
  });

  it("appends a second batch rather than overwriting the first", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await as(admin)(t).action(api.admin_demo.seedDemoData, {});
    const afterFirst = await t.run((ctx) => ctx.db.query("issues").collect());

    await as(admin)(t).action(api.admin_demo.seedDemoData, {});
    const afterSecond = await t.run((ctx) => ctx.db.query("issues").collect());

    expect(afterSecond).toHaveLength(afterFirst.length * 2);
  });

  it("refuses a mutation given fewer images than the batch needs", async () => {
    // The action and the mutation each believe a batch is 12 images. If that
    // number moves on one side only, the mutation must refuse rather than point
    // evidence at a storage id that was never written.
    const t = setup();
    const admin = await makeUser(t, "admin");
    const one = await storeImage(t);

    await expect(
      as(admin)(t).mutation(internal.admin_demo.writeDemoData, {
        storageIds: [one],
      }),
    ).rejects.toThrow(/ran out of images/i);
  });

  it("rejects a storage id the caller made up", async () => {
    const t = setup();
    const admin = await makeUser(t, "admin");
    await expect(
      as(admin)(t).mutation(internal.admin_demo.writeDemoData, {
        storageIds: ["not-an-id" as Id<"_storage">],
      }),
    ).rejects.toThrow();
  });

  it("keeps the mutation's own gate even if the action's is skipped", async () => {
    // Calling the internal mutation directly must not be a way around the
    // authorisation the action does first.
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      as(citizen)(t).mutation(internal.admin_demo.writeDemoData, {
        storageIds: [],
      }),
    ).rejects.toThrow(/administrator/i);
  });

  it("keeps the authorisation query's gate", async () => {
    const t = setup();
    const citizen = await makeUser(t, "citizen");
    await expect(
      as(citizen)(t).query(internal.admin_demo.assertMaySeed, {}),
    ).rejects.toThrow(/administrator/i);
  });

});
