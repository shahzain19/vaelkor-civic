/**
 * Canonical CIVIC domain vocabulary shared by the Convex backend and the UI.
 *
 * Status colours follow the product's own map legend (vision doc §17):
 * broken → confirmed → active → inspection → resolved.
 */

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

/** Work-order priority reuses the same visual language as the status tones. */
export const PRIORITY_TONE: Record<string, Tone> = {
  high: "broken",
  medium: "active",
  low: "confirmed",
};
