import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  categoryLabel,
  LEGACY_ROLES,
  type NotificationKind,
} from "../lib/civic";

/**
 * In-app notification fan-out.
 *
 * Lives in its own module rather than in `lifecycle.ts` because
 * `lifecycle.ts` calls into this file, so anything imported here must not
 * import back. That rules out `lib.ts` (which imports `lifecycle`) and is why
 * the category label is read from the shared vocabulary module instead.
 *
 * The contract: `notifyForTransition` is called from the same mutation that
 * moves the case, so a notification and the state it describes are written
 * atomically or not at all. There is no outbox and no retry — a notification
 * cannot get lost, because losing it would require the case transition to
 * fail, and that rolls the whole mutation back.
 */

/** Action strings emitted by `transitionLifecycle`. */
type TransitionAction =
  | "work_order_created"
  | "claimed"
  | "in_progress"
  | "completion_submitted"
  | "inspection_started"
  | "inspection_passed"
  | "inspection_failed";

/**
 * Ceiling on a single broadcast.
 *
 * `completion_submitted` notifies every inspector, because an inspector who
 * does not know work is waiting cannot inspect it. That is the one recipient
 * set that is not derived from the case, so it is the one that could grow
 * without bound. Capped rather than paginated because a notification that
 * arrives to only some of an audience is worse than one that arrives late to
 * a bounded set.
 */
const MAX_BROADCAST_RECIPIENTS = 50;

/**
 * Who receives an inspection-directed notification.
 *
 * `admin` is the role that performs inspections. The retired value is included so
 * an account that has not been migrated yet still hears about the queue it can
 * legitimately work from — a broadcast is not worth breaking a person over, and
 * the entry disappears with `LEGACY_ROLES` after the migration.
 */
const INSPECTING_ROLES = ["admin", ...LEGACY_ROLES] as const;

/** Roles derived from the case itself, as opposed to a broadcast. */
type Party = "reporter" | "contractor";

type Recipients = {
  kind: NotificationKind;
  /** Which parties on this case should hear about it. */
  direct: Party[];
  /** When true, every inspector is notified as well. */
  broadcastToAdmins: boolean;
};

/**
 * Who hears about each transition.
 *
 * The reporter is the party with no way to poll: there is no "my cases" screen
 * they would be expected to re-check, so their case moving is the event they
 * would otherwise never learn about. The contractor is told about the outcome
 * of their own work, because the inspection queue is not something they watch.
 *
 * Deliberately absent: `confirmed` and `evidence_added`. A confirmation or a
 * photo is visible on the case immediately, and notifying on every citizen
 * action would bury the four events that actually need attention.
 */
const RULES: Record<TransitionAction, Recipients> = {
  work_order_created: {
    kind: "work_ordered",
    direct: ["reporter"],
    broadcastToAdmins: false,
  },
  claimed: {
    kind: "work_claimed",
    direct: ["reporter", "contractor"],
    broadcastToAdmins: false,
  },
  in_progress: {
    kind: "work_started",
    direct: ["reporter"],
    broadcastToAdmins: false,
  },
  completion_submitted: {
    kind: "awaiting_inspection",
    direct: ["reporter"],
    broadcastToAdmins: true,
  },
  inspection_started: {
    kind: "awaiting_inspection",
    direct: ["reporter", "contractor"],
    broadcastToAdmins: false,
  },
  inspection_passed: {
    kind: "inspection_passed",
    direct: ["reporter", "contractor"],
    broadcastToAdmins: false,
  },
  inspection_failed: {
    kind: "inspection_failed",
    direct: ["reporter", "contractor"],
    broadcastToAdmins: false,
  },
};

/** Copy for each kind. `{case}` and `{title}` are substituted. */
const COPY: Record<NotificationKind, { title: string; body: string }> = {
  work_ordered: {
    title: "Your case is now a work order",
    body: "{case} reached enough independent confirmations to be actioned. A work order has been opened and is waiting for a contractor to claim it.",
  },
  work_claimed: {
    title: "A contractor has claimed {case}",
    body: "Work on {case} has been assigned and is about to begin.",
  },
  work_started: {
    title: "Work has started on {case}",
    body: "The assigned contractor has started work on {case}.",
  },
  awaiting_inspection: {
    title: "{case} is awaiting inspection",
    body: "Completion evidence has been submitted for {case}. An inspector now needs to compare the before and after record.",
  },
  inspection_passed: {
    title: "{case} passed inspection and is closed",
    body: "The work on {case} was verified against the checklist and the case has been resolved.",
  },
  inspection_failed: {
    title: "{case} failed inspection",
    body: "The inspector on {case} returned the work for correction. The case is back with the contractor.",
  },
};

/**
 * Notifies the interested parties about a lifecycle transition.
 *
 * Best-effort by design: this is called *after* the state has been written, and
 * it never throws. A notification that could fail a case transition would mean
 * an inbox outage could block a resolution, which is exactly backwards. If a
 * recipient row is missing the notification is simply skipped.
 */
export async function notifyForTransition(
  ctx: MutationCtx,
  args: {
    issueId: Id<"issues">;
    action: string;
    /** The user who caused the transition. Never notified about their own act. */
    actorId?: Id<"users">;
  },
): Promise<void> {
  try {
    await fanOut(ctx, args);
  } catch {
    // Swallowed deliberately. See the note above: state has already been
    // written and must not be rolled back by a notification problem.
  }
}

async function fanOut(
  ctx: MutationCtx,
  args: { issueId: Id<"issues">; action: string; actorId?: Id<"users"> },
): Promise<void> {
  const issue = await ctx.db.get(args.issueId);
  if (!issue) return;

  const workOrder = issue.workOrderId
    ? await ctx.db.get(issue.workOrderId)
    : null;
  const contractorId = workOrder?.contractorId;
  const plan = RULES[args.action as TransitionAction];

  const recipients = new Set<Id<"users">>();
  for (const role of plan.direct) {
    if (role === "reporter") recipients.add(issue.reporterId);
    if (role === "contractor" && contractorId) recipients.add(contractorId);
  }

  if (plan.broadcastToAdmins) {
    // An index equality lookup cannot normalise a role, so the retired value is
    // queried alongside the current one. Without this, an account that has not
    // been through `admin.migrateLegacyRoles` yet would silently stop being
    // notified about inspections it is still allowed to perform.
    const queues = await Promise.all(
      INSPECTING_ROLES.map((role) =>
        ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", role))
          .take(MAX_BROADCAST_RECIPIENTS),
      ),
    );
    for (const queue of queues) {
      for (const reviewer of queue) recipients.add(reviewer._id);
    }
  }

  // Never notify someone about their own action.
  if (args.actorId) recipients.delete(args.actorId);
  if (recipients.size === 0) return;

  const copy = COPY[plan.kind];
  const caseTitle = issue.title || categoryLabel(issue.category);
  const title = copy.title.replaceAll("{case}", issue.caseNumber);
  const body = copy.body
    .replaceAll("{case}", issue.caseNumber)
    .replaceAll("{title}", caseTitle);
  const now = Date.now();

  for (const userId of recipients) {
    await ctx.db.insert("notifications", {
      userId,
      issueId: issue._id,
      workOrderId: workOrder?._id,
      kind: plan.kind,
      caseNumber: issue.caseNumber,
      title,
      body,
      createdAt: now,
    });
  }
}
