import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  issueStatusValidator,
  workOrderStatusValidator,
  checklistShape,
} from "./lifecycle";

export const categoryValidator = v.union(
  v.literal("road"),
  v.literal("garbage"),
  v.literal("drainage"),
  v.literal("streetlight"),
);

export const severityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const roleValidator = v.union(
  v.literal("citizen"),
  v.literal("contractor"),
  v.literal("inspector"),
);

export const evidenceKindValidator = v.union(
  v.literal("report"),
  v.literal("before"),
  v.literal("during"),
  v.literal("after"),
  v.literal("inspection"),
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
});
