/**
 * Workflow helpers.
 *
 * These drive a case through the real lifecycle using the real mutations, so a
 * test that needs "a case awaiting inspection" gets exactly the state the
 * product produces — not a hand-built fixture that could drift from it.
 */

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  as,
  fileReport,
  makeUser,
  storeImage,
  type Harness,
  type TestUser,
} from "./harness";

const ALL_CHECKED = {
  correctLocation: true,
  workPerformed: true,
  beforeEvidence: true,
  afterEvidence: true,
  requirementsMet: true,
};

/** Brings a case to `confirmed` using two other citizens. */
export async function reachConfirmed(
  t: Harness,
  reporter: TestUser,
): Promise<Id<"issues">> {
  const issueId = await fileReport(t, reporter);
  const second = await makeUser(t, "citizen");
  await as(second)(t).mutation(api.issues.confirm, { issueId });
  return issueId;
}

/** Brings a case to `open` with a work order, by reaching the threshold. */
export async function reachVerified(
  t: Harness,
  reporter: TestUser,
): Promise<Id<"workOrders">> {
  const issueId = await reachConfirmed(t, reporter);
  const third = await makeUser(t, "citizen");
  await as(third)(t).mutation(api.issues.confirm, { issueId });

  const issue = await t.run((ctx) => ctx.db.get(issueId));
  if (!issue?.workOrderId) {
    throw new Error("expected a work order after reaching the threshold");
  }
  return issue.workOrderId;
}

/**
 * Brings a case to a stage where fund claims can be submitted — i.e. a work
 * order exists and is still open. Returns both ids so callers can refer to
 * either the case or the order.
 */
export async function reachFundingStage(
  t: Harness,
  reporter: TestUser,
): Promise<{ issueId: Id<"issues">; workOrderId: Id<"workOrders"> }> {
  const workOrderId = await reachVerified(t, reporter);
  const issueId = await t.run((ctx) => ctx.db.get(workOrderId).then((w) => w!.issueId));
  return { issueId, workOrderId };
}

/** Drives a case all the way to `completion_submitted`. */
export async function reachAwaitingInspection(
  t: Harness,
  reporter: TestUser,
  contractor?: TestUser,
): Promise<{ issueId: Id<"issues">; workOrderId: Id<"workOrders">; contractor: TestUser }> {
  const workOrderId = await reachVerified(t, reporter);
  const worker = contractor ?? (await makeUser(t, "contractor"));
  const issueId = await t.run((ctx) => ctx.db.get(workOrderId).then((w) => w!.issueId));

  await as(worker)(t).mutation(api.workOrders.accept, { workOrderId });
  // Claimed is not performed: the work order only reaches `completion_submitted`
  // from `in_progress`, so the start step is part of the real journey.
  await as(worker)(t).mutation(api.workOrders.start, { workOrderId });
  await as(worker)(t).mutation(api.evidence.attach, {
    issueId,
    kind: "before",
    storageId: await storeImage(t),
  });
  await as(worker)(t).mutation(api.evidence.attach, {
    issueId,
    kind: "after",
    storageId: await storeImage(t),
  });
  await as(worker)(t).mutation(api.workOrders.submitCompletion, { workOrderId });

  return { issueId, workOrderId, contractor: worker };
}

/** Passes an inspection, closing the case. */
export async function closeCase(
  t: Harness,
  workOrderId: Id<"workOrders">,
  inspector?: TestUser,
): Promise<TestUser> {
  const reviewer = inspector ?? (await makeUser(t, "admin"));
  // `closed` is only reachable from `inspection`, never straight from
  // `completion_submitted`.
  await as(reviewer)(t).mutation(api.inspections.beginInspection, { workOrderId });
  await as(reviewer)(t).mutation(api.inspections.decide, {
    workOrderId,
    result: "pass",
    checklist: ALL_CHECKED,
  });
  return reviewer;
}

export { ALL_CHECKED };
