"use client";

import Image from "next/image";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowRight,
  Camera,
  FileCheck2,
  Gavel,
  HardHat,
  MapPin,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CaseLedger } from "@/components/case-list";
import { Skeleton } from "@/components/feedback";
import { PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { CONFIRMATION_THRESHOLD, PHASES, ROLE_LABEL, type Role } from "@/lib/civic";
import {
  LOCATION_PRIVACY_QUERY_M,
  LOCATION_PRIVACY_STORE_M,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * Roles. Every line here is enforced by the server, not by the interface — the
 * page states the boundary so nobody has to discover it by hitting an error.
 */
/**
 * Where each role's work happens.
 *
 * Kept separate from the `ROLES` table below, which is deliberately civic-only:
 * it explains what reporting, repairing and inspecting mean to the public.
 * Oversight is a staff function rather than a civic one, so it is listed here
 * rather than given a row of marketing copy.
 */
const WORKSPACE_BY_ROLE: Record<Role, string> = {
  citizen: "/report",
  contractor: "/contractor",
  admin: "/admin",
};

const ROLES = [
  {
    role: "citizen" as const,
    label: "Citizen",
    icon: Users,
    can: "Report a fault with a photo, confirm reports from other people, add more evidence later.",
    cannot: "Accept work orders or close a case.",
    href: "/report",
  },
  {
    role: "contractor" as const,
    label: "Contractor",
    icon: HardHat,
    can: "Accept open work orders, file before and after photographs, submit completion for review.",
    cannot: "Confirm reports or decide an inspection.",
    href: "/contractor",
  },
  {
    role: "admin" as const,
    label: "Administrator",
    icon: Gavel,
    can: "Compare before and after evidence against a checklist, then pass or fail each case.",
    cannot: "Accept work or file execution evidence.",
    href: "/inspect",
  },
];

/** The anti-fraud rules. Each one corresponds to a server-side check. */
const RULES = [
  {
    icon: Camera,
    title: "A report needs a photograph",
    body: "No image, no case. The first photograph is part of the record, not an attachment to it.",
  },
  {
    icon: UserCheck,
    title: `Three people confirm before work is ordered`,
    body: `A case becomes actionable at ${CONFIRMATION_THRESHOLD} independent confirmations, and one person can only confirm once.`,
  },
  {
    icon: ShieldCheck,
    title: "Confirmations freeze once work starts",
    body: "The moment a work order exists the count locks, so a popular case cannot be inflated into urgency.",
  },
  {
    icon: HardHat,
    title: "Only the assigned contractor can file proof",
    body: "Before and after evidence is rejected from anyone who does not hold that specific work order.",
  },
  {
    icon: FileCheck2,
    title: "Nothing closes without an inspector",
    body: "Completion moves a case to inspection, never to closed. An inspector records the decision, and cannot file the work evidence they are judging.",
  },
];

export default function LandingPage() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const recent = useQuery(api.issues.listRecent, { limit: 4 });

  const workspace = me?.role ? WORKSPACE_BY_ROLE[me.role] : undefined;
  const roleName = me?.role ? ROLE_LABEL[me.role] : null;

  return (
    <PageShell width="wide">
      {/* Masthead. The lifecycle sits beside the headline rather than under a
          slogan, so a first-time visitor reads how the product actually works
          before deciding anything. */}
      <div className="grid gap-10 pt-12 pb-4 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-16 lg:pb-8">
        <div className="max-w-[46ch]">
          <div className="mb-4 flex items-center gap-2.5">
            <Image
              src="/vaelkor-civic.png"
              alt=""
              width={512}
              height={512}
              // No `priority`: the header already preloads this exact URL, and a
              // second preload link for the same resource is pure overhead.
              sizes="36px"
              className="size-9 shrink-0 rounded-[4px] object-cover"
            />
            <div className="eyebrow">Municipal fault reporting</div>
          </div>
            <h1 className="text-[2.1rem] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[2.9rem]">
              Karachi’s streets, fixed by the community.
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-muted-foreground text-pretty">
              Karachi’s streets need fixing. Report a fault, get it confirmed by neighbours, and see it completed with before-and-after photos. Every step is recorded for transparency.
              Whether it’s a broken streetlight, a clogged drain, or a pothole, we make sure it gets fixed.
            </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Link href="/report" className={buttonVariants({ size: "lg" })}>
              Report a problem
              <ArrowRight />
            </Link>
            <Link
              href="/ledger"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Open the ledger
            </Link>
          </div>

          <p className="mt-4 text-[0.8125rem] text-muted-foreground">
            No account needed to read the ledger. Reporting takes a photo and a
            location.
          </p>
        </div>

        {/* The chain, as a numbered record. */}
        <div className="lg:pt-1">
          <h2 className="eyebrow mb-3">The chain of custody</h2>
          <ol className="border-t border-border">
            {PHASES.map((p, i) => (
              <li
                key={p.key}
                className="flex gap-3.5 border-b border-border py-3"
              >
                <span className="mt-px shrink-0 font-mono text-[0.75rem] text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium">
                    {p.label}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {p.blurb}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Hero image — Karachi, the city this product serves. */}
      <div className="relative h-[16rem] w-full overflow-hidden sm:h-[22rem] lg:h-[28rem]">
        <Image
          src="/Gemini_Generated_Image_8gwjwj8gwjwj8gwj.jpeg"
          alt="Karachi cityscape at dusk"
          fill
          priority
          className="object-cover"
          sizes="(min-width: 1024px) 100vw, (min-width: 640px) 100vw, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute bottom-4 left-6 right-6 sm:bottom-6 sm:left-8">
          <p className="text-[0.75rem] font-mono text-white/60">
            Karachi, Pakistan &middot; 15 million citizens
          </p>
        </div>
      </div>

      {/* Live cases. Real rows from the database rather than a mock screenshot,
          so the landing page cannot drift away from the product. */}
      <Section
        label="From the ledger"
        aside={
          <Link
            href="/ledger"
            className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-foreground hover:underline"
          >
            All cases
            <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        {recent === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-[0.9375rem] text-muted-foreground">
            No cases have been reported yet. The first one is yours to file.
          </p>
        ) : (
          <>
            <CaseLedger issues={recent} />
            <p className="mt-3 text-xs text-muted-foreground">
              Case numbers are permanent. Nothing is deleted from the record.
            </p>
          </>
        )}
      </Section>

      {/* Roles as a permissions ledger, not three feature cards. */}
      <Section
        label="Who does what"
        aside={
          isAuthenticated && !workspace ? (
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-status-confirmed hover:underline"
            >
              Choose your role
              <ArrowRight className="size-3.5" />
            </Link>
          ) : undefined
        }
      >
        <div className="border-t border-border">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.role}
                className="border-b border-border py-4 first:border-t"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="text-[0.9375rem] font-medium">{r.label}</span>
                </div>
                <p className="mt-2 text-[0.875rem] leading-relaxed">{r.can}</p>
                <p className="mt-1 text-[0.875rem] leading-relaxed text-muted-foreground">
                  <span className="sr-only">Cannot </span>
                  {r.cannot}
                </p>
                <div className="mt-3">
                  <Link
                    href={r.href}
                    className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-foreground hover:underline"
                  >
                    {isAuthenticated && me?.role === r.role ? "Open" : "View"}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section label="Why a case can be trusted">
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map((rule, i) => {
            const Icon = rule.icon;
            return (
              <li key={rule.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border">
                  <Icon className="size-3.5 text-foreground" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium">
                    {rule.title}
                  </span>
                  <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted-foreground text-pretty">
                    {rule.body}
                  </span>
                  <span className="sr-only">Rule {i + 1}.</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Privacy stated as verifiable constants, imported from the same module
          the geolocation hook uses, so the claim cannot go stale. */}
      <Section label="Your location">
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <p className="text-[0.9375rem] leading-relaxed text-pretty">
            Reporting a fault necessarily involves a place. It does not
            necessarily involve your address, and it never involves handing your
            phone&rsquo;s raw position to a server.
          </p>
          <ul className="space-y-3.5">
            <li className="flex gap-3">
              <MapPin
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-[0.875rem] leading-relaxed">
                Your raw GPS reading stays in a browser variable and is never
                uploaded.
              </p>
            </li>
            <li className="flex gap-3">
              <MapPin
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-[0.875rem] leading-relaxed">
                The pin stored on a case is randomly shifted by up to{" "}
                <span className="font-mono text-foreground">
                  {LOCATION_PRIVACY_STORE_M} m
                </span>
                , so it points at the fault, not at your door.
              </p>
            </li>
            <li className="flex gap-3">
              <MapPin
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-[0.875rem] leading-relaxed">
                &ldquo;Cases near me&rdquo; searches from a point shifted by up to{" "}
                <span className="font-mono text-foreground">
                  {LOCATION_PRIVACY_QUERY_M} m
                </span>
                . The distances you see are still measured from your real
                position, on your device.
              </p>
            </li>
          </ul>
        </div>
      </Section>

      <Section label="Start">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[44ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            {workspace
              ? `You are set up as ${roleName}. Your workspace is one click away, and the ledger stays public.`
              : "Read the ledger without an account. File a report when you see something wrong — it takes a photo."}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {workspace && (
              <Link href={workspace} className={buttonVariants({ size: "lg" })}>
                Go to my workspace
                <ArrowRight />
              </Link>
            )}
            {!workspace && (
              <Link href="/report" className={buttonVariants({ size: "lg" })}>
                Report a problem
                <ArrowRight />
              </Link>
            )}
            <Link
              href="/ledger"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
            >
              Open the ledger
            </Link>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
