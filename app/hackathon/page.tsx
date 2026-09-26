"use client";

import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileText,
  HardHat,
  MapPin,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { PageShell, Section } from "@/components/shell";
import { CONFIRMATION_THRESHOLD } from "@/lib/civic";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Camera,
    title: "Report with a photo",
    body: "Snap a picture of any civic fault — pothole, broken light, clogged drain. Location is captured automatically; no need to type an address.",
  },
  {
    icon: Users,
    title: `Community confirms`,
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
    title: "Trust by design",
    body: "Raw GPS never leaves your device. Case pins are randomly shifted for privacy. Confirmations lock once a work order exists — popularity cannot inflate urgency.",
  },
];

const STEPS = [
  { step: "01", title: "Take a photo", desc: "Point your phone at the problem and snap it. Add a short description and category." },
  { step: "02", title: "Pick a location", desc: "The app uses your device location. Your exact coordinates are never stored." },
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
  },
  {
    role: "Contractor",
    what: "Browse funded cases, claim work, upload evidence, get paid on verified completion.",
    where: "/contractor",
  },
  {
    role: "Administrator",
    what: "Review completed work against a checklist, pass or fail inspection, oversee cases.",
    where: "/inspect",
  },
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
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
                "Automatic GPS location (never stored raw)",
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

      {/* ── Contractor flow ──────────────────────────────────────── */}
      <Section label="Contractors picking work">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="space-y-4 text-[0.9375rem] leading-relaxed text-pretty">
            <p>
              A case only becomes available to contractors once its community
              repair fund is fully reached. This ensures there is real backing
              before any work is assigned.
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
              standard checklist. If it passes, the case is marked closed and
              the contractor is eligible for payment release.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { label: "Case status", value: "verified + funded → open" },
              { label: "Who can claim", value: "Any registered contractor" },
              { label: "Evidence required", value: "Before → During → After photos" },
              { label: "Closure trigger", value: "Administrator inspection pass" },
              { label: "Payment", value: "Released from community fund on verified close" },
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
                "grid gap-x-6 gap-y-1.5 py-4 lg:grid-cols-[11rem_minmax(0,1fr)_7rem]",
                i > 0 && "border-t border-border",
              )}
            >
              <p className="text-[0.9375rem] font-medium">{r.role}</p>
              <p className="text-[0.875rem] text-muted-foreground">{r.what}</p>
              <Link
                href={r.where}
                className="inline-flex items-center gap-1 self-end text-[0.8125rem] font-medium text-foreground hover:underline lg:self-auto"
              >
                Go to {r.role === "Citizen" ? "report" : r.role === "Contractor" ? "work" : "inspect"}
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Tech stack ───────────────────────────────────────────── */}
      <Section label="Built with">
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-[0.875rem] text-muted-foreground">
          {[
            { icon: Zap, label: "Next.js 16" },
            { icon: FileText, label: "Convex (backend)" },
            { icon: Users, label: "Clerk (auth)" },
            { icon: MapPin, label: "MapLibre GL (maps)" },
            { icon: ShieldCheck, label: "Shadcn UI" },
          ].map((tech) => (
            <div key={tech.label} className="flex items-center gap-2">
              <tech.icon className="size-3.5 text-muted-foreground" aria-hidden />
              <span>{tech.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <Section label="See it in action">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            The ledger is live. Every case you see is a real citizen report.
            Try filing one, or browse what the community is fixing right now.
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
