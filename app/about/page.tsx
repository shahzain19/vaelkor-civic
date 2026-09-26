"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Users,
  ShieldCheck,
} from "lucide-react";
import { PageShell, Section } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AboutPage() {
  return (
    <PageShell width="wide">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="pt-12 pb-8 sm:pt-16 sm:pb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back home
        </Link>

        <h1 className="mt-5 max-w-[18ch] text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]">
          Karachi has problems people already know about.
        </h1>

        <p className="mt-4 max-w-[58ch] text-[1.0625rem] leading-relaxed text-muted-foreground text-pretty">
          Broken roads. Overflowing garbage. Dead streetlights. Open drains.
          Water problems. Damaged footpaths. People see them every day. The
          problem is what happens after someone notices.
        </p>
      </div>

      {/* ── The problem ─────────────────────────────────────────── */}
      <Section label="The problem">
        <div className="max-w-[64ch] space-y-6 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            A complaint gets made. Someone takes a picture. Maybe a post goes
            up. Maybe a helpline is called.
          </p>

          <p>
            Then the trail often disappears.
          </p>

          <p>
            There isn't always a simple public record showing what was reported,
            whether anyone confirmed it, who was supposed to act, what happened
            next, or whether the problem was actually fixed.
          </p>

          <p>
            That makes a basic civic problem surprisingly difficult to follow.
            People can see what is wrong, but they often cannot easily see what
            happened afterward.
          </p>

          <p>
            <strong>
              Vaelkor Civic is our attempt to build that missing layer.
            </strong>
          </p>
        </div>
      </Section>

      {/* ── Why we built it ─────────────────────────────────────── */}
      <Section label="Why we built it">
        <div className="max-w-[64ch] space-y-6 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            We started building Vaelkor Civic around a simple question:
          </p>

          <p className="text-[1.15rem] leading-relaxed font-medium tracking-[-0.01em]">
            What would happen if citizens had a proper record of the problems
            around them?
          </p>

          <p>
            A photograph isn't enough.
          </p>

          <p>
            A complaint isn't enough.
          </p>

          <p>
            A work order isn't enough.
          </p>

          <p>
            The useful part is the chain connecting them.
          </p>

          <p>
            A problem is reported with evidence. Other people can confirm it.
            The case develops a public history. If money is involved, its
            movement can be recorded. If work is claimed to be complete, there
            should be evidence of the result.
          </p>

          <p>
            The goal isn't to make government look good or bad.
          </p>

          <p>
            <strong>
              It's to make the state of a neighbourhood harder to hide.
            </strong>
          </p>
        </div>
      </Section>

      {/* ── What we built ────────────────────────────────────────── */}
      <Section label="What we built">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Report anything",
              body: "See a broken road, damaged streetlight, overflowing drain, garbage buildup, or another civic problem? Document it, locate it, and create a case.",
            },
            {
              icon: Users,
              title: "Build public evidence",
              body: "A single complaint can be dismissed as noise. Independent confirmations provide a clearer picture of whether a problem is real and affecting a community.",
            },
            {
              icon: ShieldCheck,
              title: "Follow what happens",
              body: "A report shouldn't disappear after submission. The case can carry a visible history of evidence, confirmations, actions, and outcomes.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius)] border border-border bg-card p-5"
            >
              <div className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-muted">
                <item.icon className="size-4.5 text-foreground" />
              </div>

              <h3 className="mt-4 text-[0.9375rem] font-medium">
                {item.title}
              </h3>

              <p className="mt-2 text-[0.875rem] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The principle ────────────────────────────────────────── */}
      <Section label="The principle">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              value: "01",
              label: "Document",
              body: "Start with evidence.",
            },
            {
              value: "02",
              label: "Confirm",
              body: "Let people establish that the problem is real.",
            },
            {
              value: "03",
              label: "Follow",
              body: "Keep the history attached to the case.",
            },
            {
              value: "04",
              label: "Publish",
              body: "Make the record visible.",
            },
          ].map((item) => (
            <div
              key={item.value}
              className="rounded-[var(--radius)] border border-border bg-card p-5"
            >
              <p className="font-mono text-[0.75rem] text-muted-foreground">
                {item.value}
              </p>

              <p className="mt-5 text-[1rem] font-medium">
                {item.label}
              </p>

              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Transparency ─────────────────────────────────────────── */}
      <Section label="Why transparency matters">
        <div className="max-w-[56ch] space-y-5 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            Civic infrastructure is not an abstract issue.
          </p>

          <p>
            A pothole damages someone's bike. A broken streetlight changes how
            someone gets home. A blocked drain can turn a road into a river.
            Garbage doesn't stay contained to one photograph.
          </p>

          <p>
            These are ordinary problems, but they affect millions of ordinary
            decisions every day.
          </p>

          <p>
            We believe technology should make those problems easier to
            document, understand, and follow through.
          </p>

          <p>
            <strong>Not replace citizens.</strong>
            <br />
            <strong>Not replace institutions.</strong>
            <br />
            <strong>Give people better tools to participate in their city.</strong>
          </p>
        </div>
      </Section>

      {/* ── Not pretending ───────────────────────────────────────── */}
      <Section label="Where we are">
        <div className="max-w-[64ch] space-y-6 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            Vaelkor Civic isn't being presented as a finished solution to
            Karachi's infrastructure problems.
          </p>

          <p>
            It's a system we're building and testing around a simple principle:
          </p>

          <p className="text-[1.15rem] leading-relaxed font-medium tracking-[-0.01em]">
            If something affects the public, the public should be able to see
            its record.
          </p>

          <p>
            The first version is focused on Karachi. The underlying idea isn't
            limited to Karachi.
          </p>

          <p>
            Every city has roads that need fixing, lights that stop working,
            drains that need attention, and problems that fall between the
            cracks.
          </p>

          <p>
            The technology can help create the missing trail between{" "}
            <strong>someone noticing a problem</strong> and{" "}
            <strong>everyone being able to see what happened to it.</strong>
          </p>
        </div>
      </Section>

      {/* ── Join ─────────────────────────────────────────────────── */}
      <Section label="Start with one problem">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            You don't need to fix a city to make a difference. Start with one
            road, one streetlight, one blocked drain, or one properly
            documented case.
          </p>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Link
              href="/report"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Report a problem
              <ArrowRight className="ml-1 size-4" />
            </Link>

            <Link
              href="/ledger"
              className={cn(
                buttonVariants({
                  size: "lg",
                  variant: "outline",
                })
              )}
            >
              Read the ledger
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Footer note ─────────────────────────────────────────── */}
      <div className="pb-12 pt-2 text-center text-[0.75rem] text-muted-foreground">
        <p>Vaelkor Civic · Karachi, Pakistan</p>

        <p className="mt-1">
          Built by citizens, for citizens. Open ledger, open future.
        </p>
      </div>
    </PageShell>
  );
}