import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { LEGACY_ROLES, NOTIFICATION_KINDS, ROLES } from "../lib/civic";
import {
  issueStatusValidator,
  workOrderStatusValidator,
  checklistShape,
  SEVERITIES,
} from "./lifecycle";

export const categoryValidator = v.union(
  v.literal("road"),
  v.literal("garbage"),
  v.literal("drainage"),
  v.literal("streetlight"),
);

export const severityValidator = v.union(
  ...SEVERITIES.map((s) => v.literal(s)),
);

/**
 * Derived from `ROLES` rather than written out again.
 *
 * This was previously a hand-maintained duplicate of the list in
 * `convex/lifecycle.ts`, and there were three more copies elsewhere. Five
 * independent statements of the same union is five chances to add a role in four
 * of them, which is exactly how a role ends up valid on the server and absent
 * from the UI. Deriving it makes that class of bug unrepresentable.
 */
/**
 * Includes `LEGACY_ROLES` on purpose, and only for as long as it takes to migrate.
 *
 * Convex validates a document whenever it is read, so a row still holding a
 * removed role makes `users.me` throw for that account and fails any query over
 * `users`. Accepting the old value keeps those accounts working, and
 * `normalizeRole` makes them behave as the role that replaced it. Run
 * `admin.migrateLegacyRoles` (ops-only) and, once it reports none left, delete
 * this spread and `LEGACY_ROLES` together.
 */
export const roleValidator = v.union(
  ...ROLES.map((r) => v.literal(r)),
  ...LEGACY_ROLES.map((r) => v.literal(r)),
);

export const evidenceKindValidator = v.union(
  v.literal("report"),
  v.literal("before"),
  v.literal("during"),
  v.literal("after"),
  v.literal("inspection"),
);

/**
 * Why a notification exists.
 *
 * Derived from the shared vocabulary so the backend validator and the UI's
 * rendering table cannot drift — a kind the UI has no case for would render
 * as a blank badge, and a kind the backend invents would never render at all.
 */
export const notificationKindValidator = v.union(
  ...NOTIFICATION_KINDS.map((k) => v.literal(k)),
);

export { issueStatusValidator, workOrderStatusValidator, checklistShape };

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.optional(roleValidator),
    createdAt: v.number(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_role", ["role"]),

  issues: defineTable({
    caseNumber: v.string(),
    category: categoryValidator,
    title: v.string(),
    description: v.string(),
    severity: severityValidator,
    status: issueStatusValidator,
    lat: v.number(),
    lng: v.number(),
    address: v.string(),
    reporterId: v.id("users"),
    confirmationCount: v.number(),
    evidenceCount: v.number(),
    workOrderId: v.optional(v.id("workOrders")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_caseNumber", ["caseNumber"])
    .index("by_createdAt", ["createdAt"])
    // Supports the oversight queue, which orders by what moved most recently.
    .index("by_updatedAt", ["updatedAt"])
    // Duplicate-report detection scans only the reporter's own recent cases.
    .index("by_reporter", ["reporterId"]),

  confirmations: defineTable({
    issueId: v.id("issues"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_issue_user", ["issueId", "userId"]),

  evidence: defineTable({
    issueId: v.id("issues"),
    userId: v.id("users"),
    kind: evidenceKindValidator,
    storageId: v.id("_storage"),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"]),

  workOrders: defineTable({
    issueId: v.id("issues"),
    caseNumber: v.string(),
    scope: v.array(v.string()),
    status: workOrderStatusValidator,
    contractorId: v.optional(v.id("users")),
    priority: severityValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_issue", ["issueId"])
    .index("by_contractor", ["contractorId"]),

  inspections: defineTable({
    workOrderId: v.id("workOrders"),
    issueId: v.id("issues"),
    inspectorId: v.id("users"),
    result: v.union(v.literal("pass"), v.literal("fail")),
    checklist: checklistShape,
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_workOrder", ["workOrderId"])
    // Supports the failure-budget check without loading the whole history.
    .index("by_issue_result", ["issueId", "result"]),

  /**
   * Extra inspection attempts granted to a case by an administrator.
   *
   * Append-only, and that is the whole design. Whether a case is *stuck* is
   * derived — failed inspections counted against a budget of
   * `MAX_INSPECTION_FAILURES` plus everything granted here — so there is no
   * `locked` flag to fall out of step with the inspection history, which is
   * exactly the drift `admin.integrityCheck` exists to catch. Granting more
   * budget is the only way out, and every grant is a permanent, attributable
   * record of who decided the case deserved another attempt.
   *
   * Note what is deliberately absent: no way to delete a failed inspection, and
   * no way to close a case. Rewriting an inspector's ruling or closing a case
   * without a pass would defeat the two invariants the product rests on, so
   * neither is reachable from here.
   */
  budgetGrants: defineTable({
    issueId: v.id("issues"),
    /** Who decided. Kept even if the account is later removed. */
    grantedBy: v.id("users"),
    /** Additional failed attempts permitted. */
    attempts: v.number(),
    /** Why, in the administrator's words. Appears on the case history. */
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_grantedAt", ["createdAt"]),

  activityLogs: defineTable({
    issueId: v.id("issues"),
    actorId: v.optional(v.id("users")),
    action: v.string(),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_issue", ["issueId"]),

  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  /**
   * Fixed-window rate limit counters.
   *
   * One row per (subject, action, window). Rows are overwritten rather than
   * appended, so the table size is bounded by
   * `subjects x actions x ceil(uptime / window)` and old windows are swept
   * lazily by `enforceRateLimit`.
   */
  rateLimits: defineTable({
    /** e.g. `user:abc123` or `ip:1.2.3.4` */
    key: v.string(),
    /** Start of the current window, ms epoch, floored to the window size. */
    windowStart: v.number(),
    count: v.number(),
  })
    // One row per key, so the counter can be read and written without scanning.
    .index("by_key", ["key"]),

  /**
   * Write-intent records used to make retries idempotent and to detect
   * double submissions of the same report.
   */
  idempotencyKeys: defineTable({
    key: v.string(),
    userId: v.id("users"),
    /**
     * The case this key produced, written at the end of the same mutation.
     * Storing it is what turns a retry into a redirect to the original case
     * instead of a dead end.
     */
    issueId: v.optional(v.id("issues")),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  /**
   * The resolved outcome of a case.
   *
   * Written in the same mutation that moves a case to `closed`, which is what
   * makes "status says resolved but there is no resolution" unrepresentable
   * rather than merely unlikely.
   */
  resolutions: defineTable({
    issueId: v.id("issues"),
    workOrderId: v.id("workOrders"),
    inspectionId: v.id("inspections"),
    inspectorId: v.id("users"),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_workOrder", ["workOrderId"]),

  /**
   * The target a community fund must reach before a contractor may claim work.
   *
   * Minted by `createWorkOrderForIssue` from a category default, and that is
   * the only write path in Phase 1 — there is no UI surface for setting a goal
   * yet, so the row cannot drift from the work order it was born from.
   *
   * The goal is a property of the *case*, not of the work order, and it is
   * written before the case moves to `open`. Storing it on the issue rather
   * than the work order means the dossier can read it without a join, and
   * means a future reporter override (Phase 4) has a single place to write.
   */
  fundGoals: defineTable({
    issueId: v.id("issues"),
    workOrderId: v.id("workOrders"),
    /** The amount the community must raise, in cents. */
    targetCents: v.number(),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_workOrder", ["workOrderId"]),

  /**
   * A community pledge toward a case.
   *
   * Written only after an admin approves a `fundClaim`. One approved claim per
   * (user, case). Contributions are held, not spent. Nothing here records a
   * movement of money out of the ledger; that is `fundPayouts`, and it happens
   * only on a verified closure.
   */
  fundContributions: defineTable({
    issueId: v.id("issues"),
    userId: v.id("users"),
    /** Pledged amount, in cents. */
    amountCents: v.number(),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_issue_user", ["issueId", "userId"]),

  /**
   * A pending payment claim from a citizen who has sent money via bank transfer,
   * EasyPaisa, or JazzCash and uploaded a screenshot as proof.
   *
   * Admins review and approve (or reject) these. On approval the claim is
   * converted into a `fundContributions` row. This keeps the app free of any
   * payment-processing surface while still recording real money coming in.
   */
  fundClaims: defineTable({
    issueId: v.id("issues"),
    userId: v.id("users"),
    /** Amount the claimant says they sent, in cents. */
    amountCents: v.number(),
    /** How they paid: bank transfer, EasyPaisa, or JazzCash. */
    paymentMethod: v.string(),
    /** Screenshot of the payment confirmation from storage. */
    screenshotStorageId: v.id("_storage"),
    /** Status of this claim. */
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    /** Optional note from the admin on approval/rejection. */
    adminNote: v.optional(v.string()),
    createdAt: v.number(),
    /** Set when the claim is reviewed. */
    reviewedAt: v.optional(v.number()),
    /** The admin who reviewed it. */
    reviewerId: v.optional(v.id("users")),
  })
    .index("by_issue", ["issueId"])
    .index("by_user", ["userId"])
    .index("by_issue_status", ["issueId", "status"]),

  /**
   * The release of the fund to the contractor.
   *
   * Written in the same mutation that moves the case to `closed` (see
   * `inspections.decide`), so "the case is closed" and "the contractor was
   * paid" are one fact rather than two that can drift. If the transition
   * below is rejected the whole mutation rolls back and the payout is
   * unwritten with it.
   *
   * This is the only place money leaves the ledger, and the only place it can
   * leave. There is no refund path and no partial release.
   */
  fundPayouts: defineTable({
    issueId: v.id("issues"),
    workOrderId: v.id("workOrders"),
    inspectionId: v.id("inspections"),
    contractorId: v.id("users"),
    /** Released amount, in cents. Must equal the goal at closure. */
    amountCents: v.number(),
    createdAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_workOrder", ["workOrderId"]),

  /**
   * In-app notifications.
   *
   * Written in the same mutation as the lifecycle transition that caused them,
   * so a notification can never disagree with the state it describes. There is
   * no outbox and no delivery worker: the row *is* the delivery, and the
   * recipient's own query is the only thing that can mark it read.
   */
  notifications: defineTable({
    userId: v.id("users"),
    /** Always present: every notification is about a case. */
    issueId: v.id("issues"),
    workOrderId: v.optional(v.id("workOrders")),
    kind: notificationKindValidator,
    /**
     * Denormalised so the notifications page renders without a lookup per row.
     * Copied from the issue at write time and never expected to stay in sync
     * with a later edit — a case number is permanent anyway.
     */
    caseNumber: v.string(),
    title: v.string(),
    body: v.string(),
    /** Absent means unread. Set once, never cleared back. */
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    // Supports the unread badge without loading the recipient's whole history.
    .index("by_user_unread", ["userId", "readAt"]),
});
