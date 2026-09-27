"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Database,
  DollarSign,
  FileText,
  Flag,
  HardHat,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  MessageSquare,
  Route,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { PageShell, Section } from "@/components/shell";
import {
  CATEGORIES,
  CONFIRMATION_THRESHOLD,
  FUND_CONTRIBUTION,
  FUND_GOAL_MAX,
  FUND_GOAL_TIERS,
  NOTIFICATION_KINDS,
  PAYMENT_METHODS,
  STATUS_ORDER,
  formatCents,
} from "@/lib/civic";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const FUNDING_GATE = 0.8;

const pkr = (cents: number) =>
  `PKR ${formatCents(cents).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const FEATURES = [
  {
    icon: Camera,
    title: "Report with a photo",
    body: "Snap a picture of any civic fault — pothole, broken light, clogged drain. Location is captured automatically; no need to type an address.",
  },
  {
    icon: Users,
    title: "Community confirms",
    body: `After ${CONFIRMATION_THRESHOLD} independent people confirm the report, the case is verified and moves to funding. Noise stays noise.`,
  },
  {
    icon: DollarSign,
    title: "Community-funded repairs",
    body: "Anyone can pledge toward a case's repair fund. Once the goal is reached, the case becomes open for contractors to claim.",
  },
  {
    icon: HardHat,
    title: "Contractors pick work",
    body: "Contractors browse verified, funded cases and claim the work they can do. Only the assigned contractor files before-and-after evidence.",
  },
  {
    icon: ClipboardCheck,
    title: "Evidence-backed close",
    body: "Work moves to inspection after completion evidence is filed. An administrator compares before and after photos against a checklist and marks the case resolved.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-gaming by construction",
    body: `Confirmations lock the moment a work order exists, so popularity can never inflate a case that is already being worked. Every lifecycle edge is an asserted transition, not a free-text status.`,
  },
];

const NETWORK_FEATURES = [
  {
    icon: MessageSquare,
    title: "Civic posts",
    body: "Citizens post issues, updates, or observations with photos. Posts are public, categorical, and can link to existing ledger cases.",
  },
  {
    icon: Users,
    title: "\"I'm affected too\"",
    body: "Not a like — a civic confirmation. One per person. Counts show \"47 residents affected\" and drive visibility in Civic Pulse.",
  },
  {
    icon: MessageSquare,
    title: "Comments",
    body: "Flat, useful local information — \"this has been broken for three weeks\", \"repair started this morning\". No nested threads.",
  },
  {
    icon: ClipboardCheck,
    title: "Work order integration",
    body: "A post linked to a case shows live status, work order progress, contractor name, and before/after evidence — no need to leave the post.",
  },
  {
    icon: BarChart,
    title: "Civic Pulse",
    body: "Real-time analytics: active cases, resolved, being worked on, posts, confirmations, comments — all counted from live rows, never fabricated.",
  },
  {
    icon: Camera,
    title: "Before / After proof",
    body: "Posts linked to cases surface the work order's before and after photographs side by side — accountability made visible.",
  },
];

const STEPS = [
  { step: "01", title: "Take a photo", desc: "Point your phone at the problem and snap it. Add a short description and category." },
  { step: "02", title: "Pick a location", desc: "The app reads your device location and places the pin on the map." },
  { step: "03", title: "Submit the report", desc: "The case enters the ledger. Others nearby will see it and can confirm." },
  { step: "04", title: "Wait for confirmation", desc: `Once ${CONFIRMATION_THRESHOLD} people confirm, the case is verified.` },
  { step: "05", title: "Fund the repair", desc: "Community pledges fill the repair fund. Once the goal is met, contractors can claim it." },
  { step: "06", title: "Work gets done", desc: "A contractor completes the repair, uploads before and after photos, and an inspector verifies closure." },
];

const ROLES = [
  {
    role: "Citizen",
    what: "Report faults, confirm neighbours' reports, contribute to community funds.",
    where: "/report",
    cta: "report",
    signup: "Self-serve at sign-up",
  },
  {
    role: "Contractor",
    what: "Browse funded cases, claim work, upload evidence, get paid on verified completion.",
    where: "/contractor",
    cta: "work",
    signup: "Self-serve at sign-up",
  },
  {
    role: "Administrator",
    what: "Review completed work against a checklist, pass or fail inspection, oversee cases.",
    where: "/inspect",
    cta: "inspect",
    signup: "Granted out of band — not self-selectable",
  },
];

const JUDGE_TOUR = [
  {
    n: "1",
    role: "Anyone, no account",
    title: "Open the ledger and the map",
    body: `The public ledger and the map are fully readable signed out. Every case, its status, its photos, and its funding progress are visible. Start from the map to see the pins, then click a case.`,
    href: "/ledger",
    cta: "/ledger",
  },
  {
    n: "2",
    role: "Citizen — sign up",
    title: "File a real report",
    body: `Sign up, pick Citizen, then file a report with a photo and a category (${CATEGORIES.map((c) => c.short).join(", ")}). The pin drops at your device location and the case appears in the ledger immediately as your own first confirmation.`,
    href: "/report",
    cta: "/report",
  },
  {
    n: "3",
    role: "Citizen",
    title: `Get it to ${CONFIRMATION_THRESHOLD} confirmations`,
    body: `Open a second account and hit Confirm. One more account confirms and the case flips to verified on its own — no operator touches it. Confirmations lock the second a work order exists.`,
    href: "/ledger",
    cta: "/ledger",
  },
  {
    n: "4",
    role: "Citizen",
    title: "Pledge to the repair fund",
    body: `A goal is assigned automatically — ${pkr(FUND_GOAL_TIERS.standard)} standard, ${pkr(FUND_GOAL_TIERS.major)} for drainage or high severity. Pledge between ${pkr(FUND_CONTRIBUTION.min)} and ${pkr(FUND_CONTRIBUTION.max)} per pledge; the progress bar moves as you do.`,
    href: "/ledger",
    cta: "/ledger",
  },
  {
    n: "5",
    role: "Contractor — sign up",
    title: "Claim the funded work",
    body: `Sign up as Contractor, open the work board, and claim an open case. A case unlocks once pledges reach ${Math.round(FUNDING_GATE * 100)}% of its goal. Claiming assigns you exclusively — nobody else can file evidence on that case.`,
    href: "/contractor",
    cta: "/contractor",
  },
  {
    n: "6",
    role: "Contractor",
    title: "File before / during / after evidence",
    body: "Upload the three evidence sets on the case. The work order moves through claimed, in progress, and completion submitted, and the case moves to inspection automatically.",
    href: "/contractor",
    cta: "/contractor",
  },
  {
    n: "7",
    role: "Administrator",
    title: "Inspect and close",
    body: "The inspection queue shows the before and after evidence side by side against a checklist. Pass closes the case and releases the resolution; fail sends it back to the contractor with a note.",
    href: "/inspect",
    cta: "/inspect",
  },
  {
    n: "8",
    role: "Citizen — sign up",
    title: "Open the Civic Network",
    body: `Go to /network — no account needed to read. See posts from the community, filter by category, browse Civic Pulse for live analytics.`,
    href: "/network",
    cta: "/network",
  },
  {
    n: "9",
    role: "Citizen",
    title: "Create a post & link a case",
    body: "Create a post about a road issue, attach a photo, and link it to an existing case from the ledger. The post now shows the case's live status, work order, and before/after evidence.",
    href: "/network/create",
    cta: "/network/create",
  },
  {
    n: "10",
    role: "Citizen",
    title: "Confirm & comment",
    body: `Hit "I'm affected too" on a post — the count increments. Add a comment with local knowledge. Watch the post appear in Civic Pulse.`,
    href: "/network",
    cta: "/network",
  },
];

const ARCHITECTURE = [
  {
    icon: Database,
    title: `${STATUS_ORDER.length} lifecycle states, asserted not assigned`,
    body: `A case moves reported → confirmed → verified → open → claimed → in progress → completion submitted → inspection → closed. Every edge is declared in one table and every transition is checked against it, so an illegal move is a rejected mutation rather than a corrupted row.`,
  },
  {
    icon: Route,
    title: "One writer for case state",
    body: "All status changes funnel through a single lifecycle function that patches the case and its work order in the same atomic mutation. A case can never sit closed while its work order still says in progress.",
  },
  {
    icon: Lock,
    title: "Server-side role gates",
    body: "Every mutation re-checks the caller's role on the server. The UI hides what you cannot do, but the check that matters is in Convex — the deployment is a public endpoint, and the client is never trusted.",
  },
  {
    icon: Layers,
    title: "Money as a ledger, in cents",
    body: `Goals, pledges and claims are integer cents — no floats in the money path. Two tiers, not nine: ${pkr(FUND_GOAL_TIERS.standard)} standard and ${pkr(FUND_GOAL_TIERS.major)} for drainage or high severity, with an administrator able to adjust a goal inside a hard ceiling.`,
  },
  {
    icon: Zap,
    title: "Evidence first, claims second",
    body: "A report is unusable without a photograph. Before, during and after evidence is attached to the work order, and closure is only reachable through an inspection that reads it.",
  },
  {
    icon: Users,
    title: "Notifications on real transitions",
    body: `${NOTIFICATION_KINDS.length} event types fan out to the reporter, the assigned contractor and the administrators watching a case, fired from the transition itself — so nobody has to remember to tell anyone.`,
  },
];

const QUALITY = [
  { label: "Automated tests", value: "265 passing", note: "Across 13 files" },
  { label: "Type safety", value: "Strict", note: "Typecheck clean, zero errors" },
  { label: "Production build", value: "Passing", note: "22 routes compiled" },
  { label: "Rate limiting", value: "Per-user", note: "On every write path" },
  { label: "Idempotency", value: "Keyed", note: "Duplicate submits rejected" },
  { label: "Roles", value: "3", note: "Citizen, contractor, admin" },
];

const REAL_VS_SIM = [
  { real: true, label: "The full report-to-closure lifecycle", note: "Real mutations, real state machine, real database rows." },
  { real: true, label: "Funding ledger and the 80% claim gate", note: "Real pledge records, enforced server-side." },
  { real: true, label: "Photo evidence on the work order", note: "Real Convex file storage with signed URLs." },
  { real: true, label: "Role separation and admin oversight", note: "Enforced on the server, not just hidden in the UI." },
  { real: true, label: "Civic Network posts, confirmations, comments", note: "Real mutations, real-time counts, linked to live cases." },
  { real: true, label: "Civic Pulse analytics", note: "Counts from live database rows via paginate({ numItems: 0 })." },
  { real: true, label: "Work order integration on posts", note: "Linked posts read case status, work order, and evidence live." },
  { real: true, label: "Before/after evidence on linked posts", note: "Surfaces the work order's actual evidence, not copies." },
  { real: false, label: "Moving actual money", note: "Pledges and claims are records of intent. No payment gateway, and the payout table is not written yet. The bank details shown are placeholders." },
  { real: false, label: "Anonymous location privacy", note: "Coordinates are stored as reported so the pin lands on the fault. We have not added coordinate jitter yet, so a report is effectively public at block level." },
  { real: false, label: "Email and SMS delivery", note: "Notifications are in-app only at this stage." },
  { real: false, label: "City-scale geospatial queries", note: "Convex has no geo index, so nearby search scans recent cases in JavaScript. Correct at pilot volume, not at city volume." },
];

const ROADMAP = [
  "Coordinate jitter on report pins, so a public case never exposes a home address.",
  "Role-gate the evidence read endpoints server-side, not only the pages that show them.",
  "Write the payout record on a passing inspection, closing the money loop in the database.",
  "Replace the duplicate-detection radius with a proper great-circle check, and drop the current degrees-versus-kilometres mismatch.",
  "Real payment rails and SMS notification delivery.",
];

export default function HackathonPage() {
  return (
    <PageShell width="wide">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="pt-12 pb-8 sm:pt-16 sm:pb-10">
        <div className="eyebrow mb-3">Hackathon 2025 · Vaelkor Civic</div>
        <h1 className="max-w-[22ch] text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]">
          Karachi&apos;s civic problems, fixed by the people who live with them.
        </h1>
        <p className="mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed text-muted-foreground text-pretty">
          Vaelkor Civic is a community-powered infrastructure reporting platform.
          Citizens document faults, neighbours confirm them, the community funds
          the repair, and licensed contractors do the work — all tracked on a
          public ledger with evidence at every step.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Link href="/report" className={buttonVariants({ size: "lg" })}>
            Try reporting
            <ArrowRight className="ml-1.5 size-4" />
          </Link>
          <Link
            href="/ledger"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
          >
            Open the ledger
          </Link>
        </div>
      </div>

      {/* ── Judge quick start ────────────────────────────────────── */}
      <Section label="Judge quick start">
        <div className="mb-5 max-w-[62ch] space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            Everything below runs against a live deployment with seeded data. The
            ledger, the map and every case page are readable without an account.
          </p>
          <p>
            To walk the full loop, sign up twice as a{" "}
            <strong>citizen</strong> and once as a{" "}
            <strong>contractor</strong> — both roles are self-serve. The{" "}
            <strong>administrator</strong> role is deliberately not
            self-selectable and is granted by an operator, so ask us if you want
            to see the inspection queue.
          </p>
        </div>
        <div className="border-t border-border">
          {JUDGE_TOUR.map((s, i) => (
            <div
              key={s.n}
              className={cn(
                "py-4",
                "md:grid md:grid-cols-[2.5rem_13rem_minmax(0,1fr)_8rem] md:items-baseline md:gap-4",
                i > 0 && "border-t border-border",
              )}
            >
              <span className="font-mono text-[0.75rem] text-muted-foreground">
                {s.n}
              </span>
              <p className="mt-1.5 text-[0.75rem] text-muted-foreground md:mt-0">
                {s.role}
              </p>
              <div className="mt-2 md:mt-0">
                <p className="text-[0.9375rem] font-medium">{s.title}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground text-pretty">
                  {s.body}
                </p>
              </div>
              <Link
                href={s.href}
                className="mt-2 inline-flex items-center gap-1 font-mono text-[0.75rem] text-foreground hover:underline md:mt-0 md:self-start"
              >
                {s.cta}
                <ArrowRight className="size-3" />
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The Problem ─────────────────────────────────────────── */}
      <Section label="The problem">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              Karachi faces millions of small civic problems every day — potholes,
              broken streetlights, overflowing drains, garbage piling up on
              sidewalks. Most never get fixed because no one has a way to track
              whether a complaint actually led to action.
            </p>
            <p>
              Complaints disappear into helplines and social media posts. There
              is no public record connecting the problem to the repair. Citizens
              have no visibility into what happens after they report, and
              contractors have no easy way to find work that the community
              already agrees needs doing.
            </p>
            <p>
              <strong>
                Vaelkor Civic closes that loop — from report to repair, all in
                public view.
              </strong>
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <p className="text-[0.75rem] font-mono text-muted-foreground">What happens today</p>
            <ol className="mt-4 space-y-3 text-[0.875rem] leading-relaxed text-muted-foreground">
              {[
                "Citizen spots a problem",
                "Takes a photo, maybe posts online",
                "No public record is created",
                "No one confirms the scale",
                "Work order may or may not be issued",
                "If work happens, no evidence trail",
                "Problem reappears, cycle restarts",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-status-broken" />
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* ── The Solution ─────────────────────────────────────────── */}
      <Section label="How it works">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="rounded-[var(--radius)] border border-border bg-card p-4"
            >
              <p className="font-mono text-[0.6875rem] text-muted-foreground">
                STEP {s.step}
              </p>
              <p className="mt-2 text-[0.9375rem] font-medium">{s.title}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <Section label="Key features">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-muted">
                <f.icon className="size-4 text-foreground" aria-hidden />
              </span>
              <div>
                <p className="text-[0.875rem] font-medium">{f.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Civic Network ──────────────────────────────────────────── */}
      <Section label="Civic Network">
        <div className="mb-5 max-w-[62ch] space-y-3 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            The Civic Network is the public accountability layer of VAELKOR CIVIC.
            It turns the ledger into a living civic space where citizens surface
            problems, communities verify them, and progress becomes visible — all
            without leaving the post.
          </p>
          <p>
            <strong>
              The core loop: Report → Post → Community → Verification → Work Order → Progress → Resolution.
            </strong>
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {NETWORK_FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-muted">
                <f.icon className="size-4 text-foreground" aria-hidden />
              </span>
              <div>
                <p className="text-[0.875rem] font-medium">{f.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Visual: The larger system */}
        <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-5">
          <p className="text-[0.75rem] font-mono text-muted-foreground">The system</p>
          <div className="mt-4 space-y-3 text-[0.875rem]">
            {[
              { label: "Citizen", icon: Users },
              { label: "Civic Network", icon: MessageSquare },
              { label: "Verified Issue", icon: CheckCircle2 },
              { label: "Work Order", icon: ClipboardCheck },
              { label: "Contractor", icon: HardHat },
              { label: "Evidence", icon: Camera },
              { label: "Resolution", icon: ShieldCheck },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-3">
                {i > 0 && (
                  <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                    ↓
                  </span>
                )}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-muted">
                  <step.icon className="size-4 text-foreground" aria-hidden />
                </span>
                <span className="font-medium">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Architecture ─────────────────────────────────────────── */}
      <Section label="Under the hood">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ARCHITECTURE.map((a) => (
            <div
              key={a.title}
              className="rounded-[var(--radius)] border border-border bg-card p-4"
            >
              <span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-muted">
                <a.icon className="size-4 text-foreground" aria-hidden />
              </span>
              <p className="mt-3 text-[0.875rem] font-medium">{a.title}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground text-pretty">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Quality ──────────────────────────────────────────────── */}
      <Section label="Quality and verification">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              A platform that holds money and photographs has to be right, not
              just demonstrable. The state machine, the funding arithmetic, the
              role gates and the claim approval path are covered by an automated
              suite that runs on every change.
            </p>
            <p>
              The tests are written against a real Convex backend harness rather
              than mocks, so the lifecycle, the storage and the authorisation
              rules are exercised as deployed. The funding tier rules are a pure
              function with an exhaustive matrix test; the funding gate is tested
              from both directions, through pledges and through approved claims.
            </p>
            <p>
              <strong>
                We would rather show you the test count than ask you to trust the
                demo.
              </strong>
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-card p-5">
            <p className="text-[0.75rem] font-mono text-muted-foreground">
              Current state
            </p>
            <div className="mt-4">
              {QUALITY.map((q, i) => (
                <div
                  key={q.label}
                  className={cn(
                    "flex items-baseline justify-between gap-4 py-2",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <span className="text-[0.8125rem] text-muted-foreground">
                    {q.label}
                  </span>
                  <span className="text-right">
                    <span className="font-mono text-[0.8125rem]">{q.value}</span>
                    <span className="block text-[0.6875rem] text-muted-foreground">
                      {q.note}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Report flow deep-dive ───────────────────────────────── */}
      <Section label="Submitting a report">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              Filing a report takes about 30 seconds on a smartphone. You take a
              photo of the fault, select a category (road, drainage, garbage,
              streetlight), and the app captures your location automatically.
              No account is required to read the ledger, but you need one to
              submit a report.
            </p>
            <p>
              Once submitted, the case appears on the public ledger and map.
              Other users in the area can confirm they see the same problem.
              After <strong>{CONFIRMATION_THRESHOLD} confirmations</strong>, the
              case is verified and a repair fund is opened. Anyone can then
              contribute toward the estimated cost. When the fund reaches its
              goal, the case becomes available for contractors to claim.
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-muted/40 p-5">
            <p className="text-[0.75rem] font-mono text-muted-foreground">Report requirements</p>
            <ul className="mt-3 space-y-2.5 text-[0.875rem]">
              {[
                "At least one photograph (required)",
                "One of four categories (road / drainage / garbage / streetlight)",
                "Location captured from the device (required)",
                `At least ${CONFIRMATION_THRESHOLD} confirmations to verify`,
                "A funded repair goal before contractor assignment",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-status-confirmed" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Funding ──────────────────────────────────────────────── */}
      <Section label="How the repair fund works">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              When a case is verified it is assigned a repair goal
              automatically. We deliberately use{" "}
              <strong>two tiers, not a table of nine</strong>: a table of
              near-identical numbers is a number nobody can hold in their head,
              and a pledger told &quot;PKR 7,300&quot; has no way to judge whether
              that is fair. The rule that picks the tier is one sentence, and it
              is printed on the case.
            </p>
            <p>
              Drainage and any high-severity case asks for{" "}
              {pkr(FUND_GOAL_TIERS.major)}. Everything else asks for{" "}
              {pkr(FUND_GOAL_TIERS.standard)}. Severity is a floor, not a
              ceiling — a high-severity pothole is not made cheap by being
              reported as one. An administrator can still adjust a single goal
              inside a hard ceiling, and the reason is recorded in the audit log.
            </p>
            <p>
              A pledge is a commitment, not a payment. The platform never moves
              money. At this stage the ledger records intent, and a passing
              inspection records that the work was verified as complete.
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-[var(--radius)] border border-border bg-card p-5">
              <p className="text-[0.75rem] font-mono text-muted-foreground">
                Funding rules
              </p>
              <div className="mt-3">
                {[
                  { label: "Standard goal", value: pkr(FUND_GOAL_TIERS.standard) },
                  { label: "Major goal", value: pkr(FUND_GOAL_TIERS.major) },
                  { label: "Assigned when", value: "drainage or high severity" },
                  { label: "Pledge size", value: `${pkr(FUND_CONTRIBUTION.min)} – ${pkr(FUND_CONTRIBUTION.max)}` },
                  { label: "Claim unlocks at", value: `${Math.round(FUNDING_GATE * 100)}% of goal` },
                  { label: "Payment methods", value: PAYMENT_METHODS.length },
                  { label: "Administrator ceiling", value: pkr(FUND_GOAL_MAX) },
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={cn(
                      "flex items-baseline justify-between gap-4 py-2",
                      i > 0 && "border-t border-border",
                    )}
                  >
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="font-mono text-[0.8125rem]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
              A pledge claim is filed against one of {PAYMENT_METHODS.length}{" "}
              supported payment methods with a screenshot, and an administrator
              credits it after verification. Unverified claims never count toward
              the goal.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Contractor flow ──────────────────────────────────────── */}
      <Section label="Contractors picking work">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              A case becomes available to contractors once pledges reach{" "}
              {Math.round(FUNDING_GATE * 100)}% of its repair goal. This ensures
              there is real backing before any work is assigned.
            </p>
            <p>
              Contractors browse the ledger or map for cases near their area of
              operation. When they claim a case, they become the sole person
              authorized to upload before, during, and after photographs. Once
              the work is done, they submit the evidence and the case moves to
              an administrator for inspection.
            </p>
            <p>
              The administrator compares the before and after evidence against a
              standard checklist. A pass closes the case and records the
              resolution. A fail returns the case to the contractor with a note
              explaining what is still outstanding.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { label: "Case status", value: "verified + funded → open" },
              { label: "Who can claim", value: "Any registered contractor" },
              { label: "Evidence required", value: "Before → During → After photos" },
              { label: "Closure trigger", value: "Administrator inspection pass" },
              { label: "Reopened on", value: "Failed inspection, with a note" },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-border py-2"
              >
                <span className="text-[0.8125rem] text-muted-foreground">{row.label}</span>
                <span className="font-mono text-[0.8125rem]">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Roles ────────────────────────────────────────────────── */}
      <Section label="Roles">
        <div className="border-t border-border">
          {ROLES.map((r, i) => (
            <div
              key={r.role}
               className={cn(
                "py-4 first:border-t",
                "md:grid md:grid-cols-[11rem_minmax(0,1fr)_9rem] md:items-baseline md:gap-4",
                i > 0 && "border-t border-border",
              )}
            >
              <p className="text-[0.9375rem] font-medium">{r.role}</p>
              <p className="mt-2 text-[0.8125rem] text-muted-foreground md:mt-0">{r.what}</p>
              <div className="mt-2 md:mt-0">
                <Link
                  href={r.where}
                  className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-foreground hover:underline"
                >
                  Go to {r.cta}
                  <ArrowRight className="size-3.5" />
                </Link>
                <p className="mt-1 flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                  <KeyRound className="size-3 shrink-0" aria-hidden />
                  {r.signup}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Honesty ──────────────────────────────────────────────── */}
      <Section label="What is real, and what is not">
        <p className="mb-5 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
          A hackathon build should be honest about its edges. Here is exactly
          what is running for real, and what is a placeholder we would finish
          before this touched a live city.
        </p>
        <div className="border-t border-border">
          {REAL_VS_SIM.map((r, i) => (
            <div
              key={r.label}
              className={cn(
                "py-3.5",
                "md:grid md:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] md:items-baseline md:gap-4",
                i > 0 && "border-t border-border",
              )}
            >
              <span
                className={cn(
                  "mt-1 flex size-4 items-center justify-center rounded-full md:mt-0",
                  r.real
                    ? "bg-status-confirmed/15 text-status-confirmed"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {r.real ? (
                  <CheckCircle2 className="size-2.5" aria-hidden />
                ) : (
                  <Flag className="size-2" aria-hidden />
                )}
              </span>
              <p className="mt-1.5 text-[0.875rem] font-medium md:mt-0">
                {r.label}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground text-pretty md:mt-0">
                {r.note}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Roadmap ──────────────────────────────────────────────── */}
      <Section label="What we would fix next">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
              In priority order, and all of it visible on the current codebase
              rather than in a wishlist document:
            </p>
            <ol className="mt-4 space-y-2.5">
              {ROADMAP.map((item, i) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[0.75rem] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[0.875rem] leading-relaxed text-pretty">
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius)] border border-border bg-muted/40 p-5">
            <p className="text-[0.75rem] font-mono text-muted-foreground">
              Built with
            </p>
            <div className="mt-3 space-y-2.5">
              {[
                { icon: Zap, label: "Next.js 16" },
                { icon: FileText, label: "Convex (backend)" },
                { icon: Users, label: "Clerk (auth)" },
                { icon: MapPin, label: "MapLibre GL (maps)" },
                { icon: Code2, label: "TypeScript (strict)" },
                { icon: ShieldCheck, label: "Shadcn UI" },
              ].map((tech) => (
                <div key={tech.label} className="flex items-center gap-2.5">
                  <tech.icon className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-[0.875rem]">{tech.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <Section label="See it in action">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            The ledger is live. Try filing a report, or browse what the community
            is fixing right now — everything on that ledger is a real record
            written by a real mutation.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Link href="/report" className={buttonVariants({ size: "lg" })}>
              Report a problem
              <ArrowRight className="ml-1.5 size-4" />
            </Link>
            <Link
              href="/ledger"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
            >
              Open the ledger
            </Link>
          </div>
        </div>
      </Section>

      <div className="pb-12 pt-2 text-center text-[0.75rem] text-muted-foreground">
        <p>Vaelkor Civic · Hackathon 2025 · Karachi, Pakistan</p>
      </div>
    </PageShell>
  );
}
