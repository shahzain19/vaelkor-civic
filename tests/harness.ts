/**
 * Shared test harness.
 *
 * `convex-test` runs the real Convex functions against an in-memory
 * implementation of the database, the system table and file storage, so these
 * tests exercise the actual mutation and query code rather than a
 * reimplementation of it. Authorization is driven through `withIdentity`, which
 * is the same surface Clerk populates in production.
 */

import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { LIMITS as FIELD_LIMITS } from "../convex/validation";
import { LIMITS as RATE_LIMITS } from "../convex/rateLimit";
import type { Category } from "../lib/civic";

type Severity = "low" | "medium" | "high";

export { api, internal, FIELD_LIMITS, RATE_LIMITS };
export type { Doc, Id };

export function setup() {
  return convexTest(schema);
}

export type Harness = ReturnType<typeof setup>;

/* Identities --------------------------------------------------------------- */

let seq = 0;
const nextSubject = () => `user_test_${++seq}`;

export type Role = "citizen" | "contractor" | "inspector";

export type TestUser = {
  subject: string;
  userId: Id<"users">;
  role: Role;
};

/**
 * Creates a Convex user row and returns the Clerk subject that reaches it.
 *
 * Rows are inserted directly rather than through `users.ensure`, because these
 * tests are about authorization and lifecycle, not about Clerk onboarding.
 */
export async function makeUser(
  t: Harness,
  role: Role = "citizen",
  name?: string,
): Promise<TestUser> {
  const subject = nextSubject();
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      name: name ?? `${role} ${subject}`,
      role,
      createdAt: Date.now(),
    }),
  );
  return { subject, userId, role };
}

/** A signed-in caller. */
export function as(user: TestUser) {
  return (t: Harness) => t.withIdentity({ subject: user.subject });
}

/**
 * An anonymous visitor.
 *
 * Note this is the *bare* harness, not `withIdentity({})`: passing an empty
 * identity object still produces a truthy identity inside Convex, so it would
 * test the wrong thing.
 */
export function anon(t: Harness) {
  return t;
}

/* Storage ------------------------------------------------------------------ */

/**
 * Stores a fake image and returns its storage id.
 *
 * `size` and `contentType` land in the `_storage` system table, which is exactly
 * what the production upload validation reads.
 */
export async function storeImage(
  t: Harness,
  opts: { contentType?: string; size?: number } = {},
): Promise<Id<"_storage">> {
  const contentType = opts.contentType ?? "image/png";
  const size = opts.size ?? 1024;
  // Convex storage takes a Blob; a bare Uint8Array has no `arrayBuffer()`.
  const blob = new Blob([new Uint8Array(size).fill(7)], { type: contentType });

  return await t.run((ctx) => ctx.storage.store(blob));
}

/** Creates a case then removes it, yielding an id that is well-formed but gone. */
export async function deletedIssueId(t: Harness): Promise<Id<"issues">> {
  const issueId = await t.run(async (ctx) => {
    const reporterId = await ctx.db.insert("users", {
      clerkId: "user_temp",
      name: "Temp",
      createdAt: Date.now(),
    });
    return await ctx.db.insert("issues", {
      caseNumber: "CIV-999999",
      category: "road",
      title: "Temporary",
      description: "Temporary row used to mint a stale id.",
      severity: "low",
      status: "reported",
      lat: 1,
      lng: 1,
      address: "Nowhere",
      reporterId,
      confirmationCount: 0,
      evidenceCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await t.run((ctx) => ctx.db.delete(issueId));
  return issueId;
}

/* Direct database reads --------------------------------------------------- */

export function readIssue(t: Harness, issueId: Id<"issues">) {
  return t.run((ctx) => ctx.db.get(issueId));
}

export function readWorkOrder(t: Harness, workOrderId: Id<"workOrders">) {
  return t.run((ctx) => ctx.db.get(workOrderId));
}

export function readAll<T extends keyof typeof schema.tables>(
  t: Harness,
  table: T,
): Promise<Doc<T>[]> {
  return t.run((ctx) => ctx.db.query(table).collect() as Promise<Doc<T>[]>);
}

/** The highest case number issued so far (0 when none). */
export function caseCount(t: Harness): Promise<number> {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", "caseNumber"))
      .collect();
    return rows[0]?.value ?? 0;
  });
}

/** Every invariant violation the admin audit reports. Empty means healthy. */
export function audit(t: Harness, adminSubject: string) {
  return t
    .withIdentity({ subject: adminSubject })
    .query(api.admin.integrityCheck, {});
}

/* Report fixture ---------------------------------------------------------- */

export const VALID_REPORT: {
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  lat: number;
  lng: number;
  address: string;
} = {
  category: "road",
  title: "Pothole in the northbound lane",
  description: "Deep pothole roughly 40cm wide in the outside lane.",
  severity: "medium",
  lat: 51.5074,
  lng: -0.1278,
  address: "12 Example Street",
};

/**
 * Files a report as `user`, returning the new case id.
 *
 * Every workflow test starts here so the setup cost is paid once and the
 * assertions can concentrate on the behaviour under test.
 */
export async function fileReport(
  t: Harness,
  user: TestUser,
  overrides: Partial<typeof VALID_REPORT> & {
    storageId?: Id<"_storage">;
    idempotencyKey?: string;
  } = {},
) {
  const { idempotencyKey, ...report } = overrides;
  const storageId = overrides.storageId ?? (await storeImage(t));
  return await t
    .withIdentity({ subject: user.subject })
    .mutation(api.issues.create, {
      ...VALID_REPORT,
      ...report,
      storageId,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    });
}
