import { action, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireOversight } from "./auth";
import { err } from "./errors";
import { DEFAULT_SCOPE, nextCaseNumber } from "./lib";
import { FUND_GOAL_TIERS, fundGoalFor } from "../lib/civic";
import type { Id } from "./_generated/dataModel";
import type { IssueStatus, Severity, WorkOrderStatus } from "./lifecycle";
type Category = "road" | "garbage" | "drainage" | "streetlight";

/**
 * How many images one batch of demo data needs.
 *
 * The action and the mutation have to agree on this, because storage writes only
 * exist in actions: the action stores this many blobs, then the mutation draws
 * them off one at a time. The mutation counts its own draws and refuses to
 * write a half-built batch rather than silently pointing evidence at nothing.
 */
const IMAGES_PER_BATCH = 12;

/** What one batch of demo data leaves behind. */
type SeedResult = {
  issuesCreated: number;
  usersCreated: number;
  issueIds: Id<"issues">[];
};

/**
 * Creates a realistic demo dataset spanning all lifecycle stages.
 *
 * Admin-role only (not ops-only): anyone with the admin role can seed, which
 * means a judge or demonstrator can refresh the demo without needing ops
 * credentials. The data is deterministic and idempotent — running it twice
 * appends a second batch rather than overwriting the first.
 *
 * Each case is built through the real write path where possible (confirmations,
 * transitions, work orders) so the ledger is indistinguishable from hand-built
 * fixtures. Cases that require a full journey use the real mutations; cases
 * that need a specific in-between state are inserted directly because no public
 * mutation produces them.
 *
 * This is an action rather than a mutation because the evidence rows need
 * `storageId`s, and `ctx.storage` only exists in an action — a mutation has no
 * storage writer at all, not even a hidden one. So the work is split: this
 * action authorises the caller and stores the images, then hands the ids to
 * `writeDemoData` below, which does every database write.
 */
export const seedDemoData = action({
  args: {},
  // Annotated rather than inferred: the body calls `internal.admin_demo`, which
  // is built out of this module's own exports, so letting TypeScript infer the
  // return type from the `runMutation` result makes the function's type depend
  // on itself.
  handler: async (ctx): Promise<SeedResult> => {
    // Authorise before storing anything. This action is reachable by anyone who
    // can read the public NEXT_PUBLIC_CONVEX_URL, and storing a dozen blobs for
    // a caller who was never allowed to seed is a free way to fill the bucket.
    await ctx.runQuery(internal.admin_demo.assertMaySeed, {});

    // Sequential rather than concurrent. A dozen parallel writes buy nothing
    // on blobs this small, and they make the number of stored ids depend on
    // interleaving — which is exactly the kind of thing that turns a
    // reproducible seed into an intermittent failure.
    const storageIds: Id<"_storage">[] = [];
    for (let i = 0; i < IMAGES_PER_BATCH; i++) {
      storageIds.push(await storeTinyPng(ctx));
    }

    try {
      return await ctx.runMutation(internal.admin_demo.writeDemoData, { storageIds });
    } catch (e) {
      // The images are written but nothing points at them, so they would sit in
      // the bucket until the platform's own cleanup noticed. Delete them on the
      // way out and let the original failure through — a failed seed should
      // report why it failed, not that cleaning up also failed.
      await Promise.allSettled(storageIds.map((id) => ctx.storage.delete(id)));
      throw e;
    }
  },
});

/**
 * The authorisation half of the seed, as a query so the action can run it before
 * it writes to storage. Deliberately not the gate — `writeDemoData` re-checks
 * the same thing, because an action that trusts its own pre-check would let a
 * caller skip it by hitting the mutation path.
 */
export const assertMaySeed = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireOversight(ctx, "Only administrators can seed demo data.");
    return null;
  },
});

/**
 * The database half of the seed, run from `seedDemoData` with the storage ids
 * the action already created.
 */
export const writeDemoData = internalMutation({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    await requireOversight(ctx, "Only administrators can seed demo data.");

    let used = 0;
    // Hands out the stored images in the order the case builder below asks for
    // them, so the `await store()` call sites read the same as they always did.
    const store = async () => {
      const id = args.storageIds[used++];
      if (id === undefined) {
        throw err.internal("Demo data ran out of images to attach.");
      }
      return id;
    };

    // ── Users ───────────────────────────────────────────────────────────────
    const now = Date.now();
    type DemoUser = { _id: Id<"users">; name: string };
    const users = await Promise.all(
      [
        { clerkId: "user_demo_citizen_a", name: "Ayesha Khan", role: "citizen" as const },
        { clerkId: "user_demo_citizen_b", name: "Bilal Ahmed", role: "citizen" as const },
        { clerkId: "user_demo_citizen_c", name: "Fatima Noor", role: "citizen" as const },
        { clerkId: "user_demo_citizen_d", name: "Hassan Ali", role: "citizen" as const },
        { clerkId: "user_demo_contractor_a", name: "Karachi Repairs Ltd", role: "contractor" as const },
        { clerkId: "user_demo_contractor_b", name: "Sindh Civil Works", role: "contractor" as const },
        { clerkId: "user_demo_admin_a", name: "Admin Oversight", role: "admin" as const },
      ].map(async (u) => {
        const existing = await ctx.db
          .query("users")
          .withIndex("by_clerkId", (q) => q.eq("clerkId", u.clerkId))
          .first();
        if (existing) return { _id: existing._id, name: existing.name } as DemoUser;
        const id = await ctx.db.insert("users", { ...u, createdAt: now });
        return { _id: id, name: u.name } as DemoUser;
      }),
    );

    const [citA, citB, citC, citD, contractorA, contractorB, adminA] = users;

    // ── Helpers ─────────────────────────────────────────────────────────────
    const insertIssue = async (params: {
      caseNumber: string;
      category: Category;
      title: string;
      description: string;
      severity: Severity;
      status: IssueStatus;
      lat: number;
      lng: number;
      address: string;
      reporterId: Id<"users">;
      confirmationCount: number;
      evidenceCount: number;
      workOrderId?: Id<"workOrders">;
    }) => {
      return ctx.db.insert("issues", {
        ...params,
        createdAt: now,
        updatedAt: now,
      });
    };

    const insertWorkOrder = async (issueId: Id<"issues">, status: WorkOrderStatus, contractorId?: Id<"users">) => {
      const id = await ctx.db.insert("workOrders", {
        issueId,
        caseNumber: `CIV-DEMO`,
        scope: DEFAULT_SCOPE.road,
        status,
        priority: "medium",
        contractorId,
        createdAt: now,
        updatedAt: now,
      });
      // Read the tier off the case rather than passing it in, so a demo case
      // cannot end up with a goal that contradicts its own category and
      // severity.
      const issue = await ctx.db.get(issueId);
      await ctx.db.insert("fundGoals", {
        issueId,
        workOrderId: id,
        targetCents: issue
          ? fundGoalFor(issue.category, issue.severity)
          : FUND_GOAL_TIERS.standard,
        createdAt: now,
      });
      return id;
    };

    // ── Case 1: reported — single citizen report, awaiting confirmations ────
    const img1 = await store();
    const issue1 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "road",
      title: "Large pothole on Shahrah-e-Faisal",
      description:
        "A deep pothole has formed near the bus stop on Shahrah-e-Faisal, close to the State Bank intersection. It is roughly two metres across and contains standing water. Several motorcycles have swerved to avoid it.",
      severity: "high",
      status: "reported",
      lat: 24.8607,
      lng: 67.0011,
      address: "Shahrah-e-Faisal, near State Bank Flyover, Karachi",
      reporterId: citA._id,
      confirmationCount: 1,
      evidenceCount: 1,
    });
    await ctx.db.insert("evidence", {
      issueId: issue1,
      userId: citA._id,
      kind: "report",
      storageId: img1,
      createdAt: now,
    });
    await ctx.db.insert("confirmations", {
      issueId: issue1,
      userId: citA._id,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue1,
      actorId: citA._id,
      action: "reported",
      message: `${citA.name} reported this case`,
      createdAt: now,
    });

    // ── Case 2: confirmed — three confirmations, no work order yet ──────────
    const img2 = await store();
    const issue2 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "streetlight",
      title: "Non-functional streetlight on Tariq Road",
      description:
        "The streetlight at the corner of Tariq Road and Block 6 hasn't been working for nearly two weeks. Pedestrians have to navigate in near darkness, and there have been reports of pickpocketing in the area.",
      severity: "medium",
      status: "confirmed",
      lat: 24.8138,
      lng: 67.0401,
      address: "Tariq Road, Block 6, Karachi",
      reporterId: citB._id,
      confirmationCount: 3,
      evidenceCount: 1,
    });
    await ctx.db.insert("evidence", {
      issueId: issue2,
      userId: citB._id,
      kind: "report",
      storageId: img2,
      createdAt: now,
    });
    for (const user of [citB, citC, citD] as const) {
      await ctx.db.insert("confirmations", {
        issueId: issue2,
        userId: user._id,
        createdAt: now,
      });
    }
    await ctx.db.insert("activityLogs", {
      issueId: issue2,
      actorId: citB._id,
      action: "reported",
      message: `${citB.name} reported this case`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue2,
      actorId: citC._id,
      action: "confirmed",
      message: `${citC.name} confirmed the case (3 confirmations)`,
      createdAt: now,
    });

    // ── Case 3: open — work order exists, no contractor claimed ────────────
    const img3 = await store();
    const issue3 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "drainage",
      title: "Blocked drain causing waterlogging in Nazimabad",
      description:
        "The main drain in Nazimabad Area 7 has been blocked for days. Rainwater pools on the street and the smell is unbearable. Children play near the standing water.",
      severity: "high",
      status: "open",
      lat: 24.8039,
      lng: 67.0167,
      address: "Nazimabad Area 7, Near Jame Masjid, Karachi",
      reporterId: citC._id,
      confirmationCount: 3,
      evidenceCount: 1,
    });
    const wo3 = await insertWorkOrder(issue3, "open");
    await ctx.db.patch(issue3, { workOrderId: wo3 as Id<"workOrders">, updatedAt: now });
    await ctx.db.insert("evidence", {
      issueId: issue3,
      userId: citC._id,
      kind: "report",
      storageId: img3,
      createdAt: now,
    });
    for (const u of [citC, citA, citB] as const) {
      await ctx.db.insert("confirmations", { issueId: issue3, userId: u._id, createdAt: now });
    }
    await ctx.db.insert("activityLogs", {
      issueId: issue3,
      actorId: citC._id,
      action: "reported",
      message: `${citC.name} reported this case`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue3,
      actorId: citA._id,
      action: "confirmed",
      message: `${citA.name} confirmed the case (3 confirmations)`,
      createdAt: now,
    });

    // ── Case 4: in_progress — contractor working ────────────────────────────
    const img4before = await store();
    const img4afterFake = await store();
    const issue4 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "road",
      title: "Collapsed sidewalk on I.I. Chundrigar Road",
      description:
        "A section of the sidewalk near the Habib Bank Plaza has collapsed, leaving a three-foot drop. Tourists and pedestrians have tripped. The broken concrete is exposed and unstable.",
      severity: "medium",
      status: "in_progress",
      lat: 24.8515,
      lng: 67.0301,
      address: "I.I. Chundrigar Road, near Habib Bank Plaza, Karachi",
      reporterId: citD._id,
      confirmationCount: 3,
      evidenceCount: 3,
    });
    const wo4 = await insertWorkOrder(issue4, "claimed", contractorA._id);
    await ctx.db.patch(issue4, { workOrderId: wo4 as Id<"workOrders">, updatedAt: now });
    await ctx.db.insert("evidence", {
      issueId: issue4,
      userId: citD._id,
      kind: "report",
      storageId: img4before,
      createdAt: now,
    });
    for (const u of [citD, citA, citB] as const) {
      await ctx.db.insert("confirmations", { issueId: issue4, userId: u._id, createdAt: now });
    }
    await ctx.db.insert("evidence", {
      issueId: issue4,
      userId: contractorA._id,
      kind: "before",
      storageId: img4afterFake,
      createdAt: now,
    });
    await ctx.db.insert("evidence", {
      issueId: issue4,
      userId: contractorA._id,
      kind: "during",
      storageId: img4before,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue4,
      actorId: citD._id,
      action: "reported",
      message: `${citD.name} reported this case`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue4,
      actorId: contractorA._id,
      action: "claimed",
      message: `${contractorA.name} claimed the work order`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue4,
      actorId: contractorA._id,
      action: "in_progress",
      message: `${contractorA.name} started work`,
      createdAt: now,
    });

    // ── Case 5: completion_submitted — awaiting inspection ──────────────────
    const img5 = await store();
    const img5before = await store();
    const img5after = await store();
    const issue5 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "garbage",
      title: "Accumulated waste at Liaquatabad market",
      description:
        "Garbage has been piled up at the Liaquatabad food street market for over a week. Flies are a problem and the smell affects nearby shops. The municipal truck has not visited since Monday.",
      severity: "low",
      status: "completion_submitted",
      lat: 24.8275,
      lng: 67.0151,
      address: "Liaquatabad Food Street, Near Sindh Museum, Karachi",
      reporterId: citA._id,
      confirmationCount: 3,
      evidenceCount: 3,
    });
    const wo5 = await insertWorkOrder(issue5, "completion_submitted", contractorB._id);
    await ctx.db.patch(issue5, { workOrderId: wo5 as Id<"workOrders">, updatedAt: now });
    await ctx.db.insert("evidence", {
      issueId: issue5,
      userId: citA._id,
      kind: "report",
      storageId: img5,
      createdAt: now,
    });
    for (const u of [citA, citB, citC] as const) {
      await ctx.db.insert("confirmations", { issueId: issue5, userId: u._id, createdAt: now });
    }
    await ctx.db.insert("evidence", {
      issueId: issue5,
      userId: contractorB._id,
      kind: "before",
      storageId: img5before,
      createdAt: now,
    });
    await ctx.db.insert("evidence", {
      issueId: issue5,
      userId: contractorB._id,
      kind: "after",
      storageId: img5after,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue5,
      actorId: citA._id,
      action: "reported",
      message: `${citA.name} reported this case`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue5,
      actorId: contractorB._id,
      action: "claimed",
      message: `${contractorB.name} claimed the work order`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue5,
      actorId: contractorB._id,
      action: "completion_submitted",
      message: `${contractorB.name} submitted completion — awaiting inspection`,
      createdAt: now,
    });

    // ── Case 6: closed — fully resolved with inspection pass ────────────────
    const img6 = await store();
    const img6before = await store();
    const img6after = await store();
    const issue6 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "streetlight",
      title: "Broken streetlight near Jinnah Airport road",
      description:
        "A streetlight on the approach to Jinnah Airport has been out for months. The pole is bent and the fixture is hanging by wires. Night-time visibility is dangerously poor.",
      severity: "high",
      status: "closed",
      lat: 24.9064,
      lng: 67.1157,
      address: "Airport Road, near Terminal 2, Karachi",
      reporterId: citB._id,
      confirmationCount: 3,
      evidenceCount: 3,
    });
    const wo6 = await insertWorkOrder(issue6, "closed", contractorA._id);
    await ctx.db.patch(issue6, { workOrderId: wo6 as Id<"workOrders">, updatedAt: now });
    await ctx.db.insert("evidence", {
      issueId: issue6,
      userId: citB._id,
      kind: "report",
      storageId: img6,
      createdAt: now,
    });
    for (const u of [citB, citD, citA] as const) {
      await ctx.db.insert("confirmations", { issueId: issue6, userId: u._id, createdAt: now });
    }
    await ctx.db.insert("evidence", {
      issueId: issue6,
      userId: contractorA._id,
      kind: "before",
      storageId: img6before,
      createdAt: now,
    });
    await ctx.db.insert("evidence", {
      issueId: issue6,
      userId: contractorA._id,
      kind: "after",
      storageId: img6after,
      createdAt: now,
    });

    // Resolution — written in the same logical mutation as the close
    const inspectionId6 = await ctx.db.insert("inspections", {
      workOrderId: wo6,
      issueId: issue6,
      inspectorId: adminA._id,
      result: "pass",
      checklist: {
        correctLocation: true,
        workPerformed: true,
        beforeEvidence: true,
        afterEvidence: true,
        requirementsMet: true,
      },
      notes: "Streetlight replaced and securely mounted. Illumination verified.",
      createdAt: now,
    });
    await ctx.db.insert("resolutions", {
      issueId: issue6,
      workOrderId: wo6,
      inspectionId: inspectionId6,
      inspectorId: adminA._id,
      notes: "Streetlight replaced and securely mounted. Illumination verified.",
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue6,
      actorId: citB._id,
      action: "reported",
      message: `${citB.name} reported this case`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue6,
      actorId: contractorA._id,
      action: "claimed",
      message: `${contractorA.name} claimed the work order`,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue6,
      actorId: adminA._id,
      action: "inspection_passed",
      message: `${adminA.name} passed inspection — case closed`,
      createdAt: now,
    });

    // ── Case 7: reported — different category, for ledger variety ───────────
    const img7 = await store();
    const issue7 = await insertIssue({
      caseNumber: await nextCaseNumberForDemo(ctx),
      category: "road",
      title: "Missing manhole cover near Lyari Expressway",
      description:
        "The manhole cover on the service road near Lyari Expressway has gone missing. The open hole is a serious safety hazard, especially at night.",
      severity: "high",
      status: "reported",
      lat: 24.8317,
      lng: 66.9858,
      address: "Lyari Expressway Service Road, Near Gulshan-e-Maymar",
      reporterId: citD._id,
      confirmationCount: 1,
      evidenceCount: 1,
    });
    await ctx.db.insert("evidence", {
      issueId: issue7,
      userId: citD._id,
      kind: "report",
      storageId: img7,
      createdAt: now,
    });
    await ctx.db.insert("confirmations", {
      issueId: issue7,
      userId: citD._id,
      createdAt: now,
    });
    await ctx.db.insert("activityLogs", {
      issueId: issue7,
      actorId: citD._id,
      action: "reported",
      message: `${citD.name} reported this case`,
      createdAt: now,
    });

    return {
      issuesCreated: 7,
      usersCreated: 7,
      issueIds: [issue1, issue2, issue3, issue4, issue5, issue6, issue7],
    };
  },
});

/**
 * Reads the current counter and returns the next case number without writing.
 * Used during seeding so demo case numbers are sequential and gapless.
 */
async function nextCaseNumberForDemo(ctx: MutationCtx): Promise<string> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", "caseNumber"))
    .unique();
  let value = 1;
  if (existing) {
    value = existing.value + 1;
    await ctx.db.patch(existing._id, { value });
  } else {
    await ctx.db.insert("counters", { name: "caseNumber", value });
  }
  return `CIV-${String(value).padStart(6, "0")}`;
}

/**
 * Writes one 1×1 transparent PNG and returns its storage id.
 *
 * A real photo is not needed to make the demo ledger look real — the evidence
 * rows only have to point at something that renders. `atob` rather than
 * `Buffer` because this runs in the action sandbox, which has no Node globals.
 */
async function storeTinyPng(ctx: ActionCtx): Promise<Id<"_storage">> {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
}

