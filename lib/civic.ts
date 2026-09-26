/**
 * Canonical CIVIC domain vocabulary shared by the Convex backend and the UI.
 *
 * Status colours follow the product's own map legend (vision doc §17):
 * broken → confirmed → active → inspection → resolved.
 */

/**
 * Every role a user row can hold.
 *
 * This lives here, in the shared vocabulary module, rather than in
 * `convex/lifecycle.ts` because the UI needs it too and cannot import a Convex
 * module into a client bundle. It was previously written out five times — the
 * schema validator, the lifecycle const, the test harness, the onboarding page,
 * and the case page's local `Me` type — which is five chances to add a role in
 * four of them. `convex/lifecycle.ts` re-exports it for the backend.
 */
export const ROLES = ["citizen", "contractor", "admin"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Role values that older rows may still hold, and which are no longer selectable.
 *
 * `inspector` was folded into `admin`: the person who signs off on the work is
 * the same person who runs case oversight, so it is one role rather than two
 * that could disagree. Removing the value from the Convex validator without
 * migrating first would make every existing row *unreadable* — Convex validates
 * documents on read, so `users.me` would throw for those accounts and any query
 * over `users` would fail. The value therefore stays in the validator (see
 * `LEGACY_ROLES` in the schema) purely so old rows keep loading, and every
 * comparison goes through `normalizeRole` so they behave as admins immediately.
 *
 * After `admin.migrateLegacyRoles` reports zero remaining, this array and the
 * schema's legacy union can both be deleted.
 */
export const LEGACY_ROLES = ["inspector"] as const;

/**
 * Maps a stored role onto the current vocabulary.
 *
 * The single place a legacy value is understood. Authorisation goes through here
 * rather than comparing raw strings, so folding one role into another cannot
 * leave a check that silently starts rejecting the people it should accept.
 */
export function normalizeRole(role: string | undefined | null): Role | undefined {
  if (role === "inspector") return "admin";
  return (ROLES as readonly string[]).includes(role ?? "")
    ? (role as Role)
    : undefined;
}

/**
 * Roles a person may choose for themselves.
 *
 * `admin` is excluded on purpose. It is granted out of band by an operator, and
 * `users.setRole` refuses to self-select it — see that mutation for why the
 * onboarding page hiding the option is not sufficient on its own.
 */
export const SELF_SELECTABLE_ROLES = [
  "citizen",
  "contractor",
] as const satisfies readonly Role[];

export function isSelfSelectableRole(role: string): role is SelfSelectableRole {
  return (SELF_SELECTABLE_ROLES as readonly string[]).includes(role);
}

export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];

/**
 * What each role is for, in one line, for the onboarding picker and the
 * header label. `admin` is absent on purpose — it is not something a person
 * opts into.
 */
export const ROLE_LABEL: Record<Role, string> = {
  citizen: "Citizen",
  contractor: "Contractor",
  admin: "Administrator",
};

export const CATEGORIES = [
  { value: "road", label: "Road damage", short: "Road" },
  { value: "garbage", label: "Garbage", short: "Waste" },
  { value: "drainage", label: "Drainage", short: "Drainage" },
  { value: "streetlight", label: "Streetlight", short: "Light" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(category: string): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function categoryShort(category: string): string {
  return CATEGORIES.find((c) => c.value === category)?.short ?? category;
}

/** All lifecycle states, in order. */
export const STATUS_ORDER = [
  "reported",
  "confirmed",
  "verified",
  "open",
  "claimed",
  "in_progress",
  "completion_submitted",
  "inspection",
  "closed",
] as const;

export type IssueStatus = (typeof STATUS_ORDER)[number];

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

/** The five phases a citizen actually cares about. */
export const PHASES = [
  {
    key: "reported",
    label: "Reported",
    blurb: "A citizen documented the problem",
    states: ["reported", "confirmed"],
  },
  {
    key: "verified",
    label: "Verified",
    blurb: "Enough independent confirmations to act",
    states: ["verified", "open"],
  },
  {
    key: "assigned",
    label: "Assigned",
    blurb: "An executor accepted the work order",
    states: ["claimed"],
  },
  {
    key: "active",
    label: "In progress",
    blurb: "Work is underway on site",
    states: ["in_progress", "completion_submitted"],
  },
  {
    key: "closed",
    label: "Closed",
    blurb: "Completion proved and inspected",
    states: ["inspection", "closed"],
  },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

export function phaseIndex(status: string): number {
  const i = PHASES.findIndex((p) => (p.states as readonly string[]).includes(status));
  return i < 0 ? 0 : i;
}

export function phaseFor(status: string) {
  return PHASES[phaseIndex(status)];
}

/** Map-legend tone for a state (vision doc §17). */
export type Tone = "broken" | "confirmed" | "active" | "inspection" | "resolved";

const TONE_BY_STATE: Record<string, Tone> = {
  reported: "broken",
  confirmed: "broken",
  verified: "confirmed",
  open: "confirmed",
  claimed: "active",
  in_progress: "active",
  completion_submitted: "inspection",
  inspection: "inspection",
  closed: "resolved",
};

export function toneFor(status: string): Tone {
  return TONE_BY_STATE[status] ?? "broken";
}

export const TONE_CLASS: Record<Tone, string> = {
  broken: "text-status-broken bg-status-broken/12",
  confirmed: "text-status-confirmed bg-status-confirmed/12",
  active: "text-status-active bg-status-active/12",
  inspection: "text-status-inspection bg-status-inspection/12",
  resolved: "text-status-resolved bg-status-resolved/12",
};

export const TONE_DOT: Record<Tone, string> = {
  broken: "bg-status-broken",
  confirmed: "bg-status-confirmed",
  active: "bg-status-active",
  inspection: "bg-status-inspection",
  resolved: "bg-status-resolved",
};

export const EVIDENCE_KINDS = [
  "report",
  "before",
  "during",
  "after",
  "inspection",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_META: Record<
  EvidenceKind,
  { label: string; blurb: string }
> = {
  report: { label: "Reported", blurb: "What the problem looked like" },
  before: { label: "Before", blurb: "Site condition prior to work" },
  during: { label: "During", blurb: "Work in progress" },
  after: { label: "After", blurb: "Site condition on completion" },
  inspection: { label: "Inspection", blurb: "Recorded by the inspector" },
};

export const CONFIRMATION_THRESHOLD = 3;

/**
 * The community fund a case must raise before a contractor may claim it.
 *
 * In cents, because floating-point money is how people get shortchanged. The
 * values are per category — a streetlight costs less to fix than a drainage
 * repair — and they are defaults only. The reporter may propose a different
 * figure, and an administrator may adjust one (see `oversight.adjustFundGoal`).
 *
 * These are pledges, not payments. The app never moves real money; the fund is
 * a commitment ledger that is released to the contractor on verified
 * completion. Nothing here is a PCI surface.
 */
export const FUND_GOALS: Record<string, number> = {
  road: 5000,
  garbage: 2000,
  drainage: 8000,
  streetlight: 4000,
};

/** The default goal for a category the map does not yet know. */
export const FUND_GOAL_DEFAULT = 5000;

/** Bounds on a single pledge, in cents. */
export const FUND_CONTRIBUTION = { min: 100, max: 50000 } as const;

/** Work-order priority reuses the same visual language as the status tones. */
export const PRIORITY_TONE: Record<string, Tone> = {
  high: "broken",
  medium: "active",
  low: "confirmed",
};

/**
 * The map legend, in the order the vision doc §17 lists it.
 *
 * This is the legend the status colours were always drawn from. Keeping it
 * beside `TONE_DOT` is what lets the map, the ledger and the legend render
 * from one list instead of three.
 */
export const TONE_LEGEND: readonly { tone: Tone; label: string; blurb: string }[] =
  [
    { tone: "broken", label: "Broken", blurb: "Reported, not yet confirmed" },
    { tone: "confirmed", label: "Confirmed", blurb: "Verified and work ordered" },
    { tone: "active", label: "Active", blurb: "A contractor is on it" },
    { tone: "inspection", label: "Inspection", blurb: "Awaiting verification" },
    { tone: "resolved", label: "Resolved", blurb: "Proven and closed" },
  ] as const;

/** Why an in-app notification exists. Mirrors the Convex validator. */
export const NOTIFICATION_KINDS = [
  "work_ordered",
  "work_claimed",
  "work_started",
  "awaiting_inspection",
  "inspection_passed",
  "inspection_failed",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Tone for a notification, so the badge matches what the case is doing. */
export const NOTIFICATION_TONE: Record<NotificationKind, Tone> = {
  work_ordered: "confirmed",
  work_claimed: "active",
  work_started: "active",
  awaiting_inspection: "inspection",
  inspection_passed: "resolved",
  inspection_failed: "broken",
};

/**
 * A fund amount, as a short human string.
 *
 * Amounts are stored in cents so there is no float drift anywhere in the
 * ledger; this is the one place they become prose. A whole-pound amount is
 * shown without a decimal and a partial one with one, which is what a person
 * actually expects to read when they have chipped in.
 */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  const pounds = Math.round(cents) / 100;
  return pounds % 1 === 0 ? `${pounds}` : pounds.toFixed(1);
}

