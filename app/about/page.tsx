"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, MapPin, Users, ShieldCheck } from "lucide-react";
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
        <h1 className="mt-5 text-[2.25rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[3rem]">
          Karachi deserves better.
        </h1>
        <p className="mt-4 max-w-[52ch] text-[1.0625rem] leading-relaxed text-muted-foreground text-pretty">
          Vaelkor Civic was born from a single pothole on a rainy evening in Gulshan-e-Iqbal — and the frustration of knowing that fixing it shouldn&apos;t require a connection, a bribe, or a prayer.
        </p>
      </div>

      {/* ── The story ────────────────────────────────────────────── */}
      <Section label="How it started">
        <div className="max-w-[64ch] space-y-6 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            It was monsoon season in 2023. Fatima, a teacher at a government school in North Nazimabad, had been walking the same route home for six years. Every evening, she stepped over the same crater in the road — wide enough to swallow a scooter wheel, deep enough to collect toxic water that attracted mosquitoes by the thousand.
          </p>
          <p>
            She complained to the union council. She posted on Facebook. She asked her husband to call his cousin who knew someone at the municipality. Nothing moved. The pothole grew. So did the dengue cases in her building.
          </p>
          <p>
            One night, her neighbour&rsquo;s child fell into the hole while playing cricket. No one was seriously hurt, but the fear was real. That&rsquo;s when Fatima realized: the problem was never that no one cared. It was that caring had no structure.
          </p>
          <p>
            <strong>What if the proof was undeniable?</strong> What if ten people could stand behind the same photograph and say &ldquo;this needs fixing&rdquo; — and the system couldn&rsquo;t ignore them? What if the money raised by the community was visible, tracked, and released only when the work was done?
          </p>
          <p>
            That night, the first line of Vaelkor Civic was written.
          </p>
        </div>
      </Section>

      {/* ── What we do ───────────────────────────────────────────── */}
      <Section label="What we built">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Report anything",
              body: "A broken streetlight. A clogged drain. A cracked footpath. Take a photo, mark the location, and file a case. It takes thirty seconds.",
            },
            {
              icon: Users,
              title: "Neighbours confirm",
              body: "Three people must verify the problem is real before a work order opens. This prevents spam, pranks, and fabrication — while proving the issue affects real people.",
            },
            {
              icon: ShieldCheck,
              title: "Fund the repair",
              body: "The community raises the money. Contractors bid for the work. Before-and-after photos prove it was done. An independent inspector signs off. Every step is public.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[var(--radius)] border border-border bg-card p-5"
            >
              <div className="size-9 rounded-[var(--radius-sm)] border border-border bg-muted flex items-center justify-center">
                <item.icon className="size-4.5 text-foreground" />
              </div>
              <h3 className="mt-4 text-[0.9375rem] font-medium">{item.title}</h3>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The numbers ──────────────────────────────────────────── */}
      <Section label="Built on trust, not promises">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { value: "3", label: "Confirmations needed" },
            { value: "100%", label: "Evidence required" },
            { value: "0", label: "Money without inspection" },
            { value: "Public", label: "Everything is logged" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--radius)] border border-border bg-card p-5 text-center"
            >
              <p className="font-mono text-[2rem] font-semibold tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[56ch] text-[0.875rem] leading-relaxed text-muted-foreground text-pretty">
          No case closes without photographs, an inspector&rsquo;s signature, and a public record. Contractors can&rsquo t re-submit work they haven&rsquo;t done. Inspectors can&rsquo;t approve what wasn&rsquo;t verified. The ledger is permanent — nothing is deleted.
        </p>
      </Section>

      {/* ── Our philosophy ──────────────────────────────────────── */}
      <Section label="Why transparency matters">
        <div className="max-w-[56ch] space-y-5 text-[0.9375rem] leading-relaxed text-pretty">
          <p>
            In a city of fifteen million, trust isn&rsquo;t given — it&rsquo;s earned. And it&rsquo;s earned when people can <strong>see</strong> what&rsquo;s happening with their money and their streets.
          </p>
          <p>
            We built Vaelkor Civic because we believe every resident of Karachi — whether in DHA, Liaquatabad, or Korangi — deserves to live on roads that don&rsquo't destroy their tyres, under lights that actually work, in neighbourhoods where drains don&rsquo;t turn their streets into rivers.
          </p>
          <p>
            This isn&rsquo;t a government app. It isn&rsquo't a charity. It&rsquo;s a <strong>ledger</strong> — a public record of problems reported, problems confirmed, money raised, money spent, and work completed. Anyone can read it. No one can erase it.
          </p>
        </div>
      </Section>

      {/* ── Join us ─────────────────────────────────────────────── */}
      <Section label="Be part of the change">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[44ch] text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            Every case on this platform started with one person who refused to look away. The next case could be yours.
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Link
              href="/report"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Report a problem
              <ArrowRight className="size-4 ml-1" />
            </Link>
            <Link
              href="/ledger"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
            >
              Read the ledger
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Footer note ─────────────────────────────────────────── */}
      <div className="pb-12 pt-2 text-center text-[0.75rem] text-muted-foreground">
        <p>
          Vaelkor Civic · Karachi, Pakistan · Est. 2024
        </p>
        <p className="mt-1">
          Built by citizens, for citizens. Open ledger, open future.
        </p>
      </div>
    </PageShell>
  );
}
