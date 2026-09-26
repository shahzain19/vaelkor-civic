"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Show } from "@clerk/nextjs";
import { ArrowLeft, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Banner, LiveRegion } from "@/components/feedback";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { isSelfSelectableRole, type SelfSelectableRole } from "@/lib/civic";
import { cn } from "@/lib/utils";

// Only the self-selectable roles. `admin` is grant-only, and `setRole`
// refuses it from the client regardless of what this page offers.
type Role = SelfSelectableRole;

const ROLES: {
  value: Role;
  label: string;
  does: string;
  cannot: string;
  lands: string;
}[] = [
  {
    value: "citizen",
    label: "Citizen",
    does: "Report problems, confirm reports from other people, add photographs.",
    cannot: "Accept work orders or close cases.",
    lands: "/ledger",
  },
  {
    value: "contractor",
    label: "Contractor",
    does: "Accept work orders, file before and after evidence, submit completion.",
    cannot: "Confirm reports or decide inspections.",
    lands: "/contractor",
  },
];

export default function OnboardingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const ensure = useMutation(api.users.ensure);
  const setRole = useMutation(api.users.setRole);
  const router = useRouter();

  const [role, setRoleLocal] = useState<Role>("citizen");
  // Adjust the selection during render when the persisted role arrives, rather
  // than syncing it from an effect.
  const [synced, setSynced] = useState<Role | undefined>(undefined);
  if (me?.role && isSelfSelectableRole(me.role) && me.role !== synced) {
    setSynced(me.role);
    setRoleLocal(me.role);
  }

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) void ensure({});
  }, [isAuthenticated, ensure]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await setRole({ role });
      router.push(ROLES.find((r) => r.value === role)!.lands);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your role. Try again.",
      );
      setBusy(false);
    }
  }

  const selected = ROLES.find((r) => r.value === role)!;

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <div className="h-80 animate-pulse rounded-[var(--radius)] bg-muted" />
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <div className="pt-6">
        <Link
          href="/ledger"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Ledger
        </Link>
      </div>

      <Show when="signed-out">
        <PageHeader
          eyebrow="Account"
          title="Sign in to continue"
          description="Your role decides what you can do in the ledger. You need an account before choosing one."
        />
        <Section>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/sign-up"
              className="rounded-[var(--radius)] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Create an account
            </Link>
            <Link
              href="/sign-in"
              className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm font-medium"
            >
              Sign in
            </Link>
          </div>
        </Section>
      </Show>

      <Show when="signed-in">
        <PageHeader
          eyebrow="Account"
          title="How do you take part?"
          description="This controls what you can do. It also decides which tools appear in the navigation."
        />

        <Section label="Choose a role">
          <fieldset className="space-y-2">
            <legend className="sr-only">Role</legend>
            {ROLES.map((r) => {
              const active = role === r.value;
              return (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-[var(--radius)] border p-3.5 transition-colors",
                    "hover:border-foreground/30 hover:bg-muted/40",
                    active && "border-foreground bg-muted/60",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={active}
                    onChange={() => setRoleLocal(r.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                      active ? "border-foreground bg-foreground" : "border-input",
                    )}
                  >
                    {active && <Check className="size-2.5 text-background" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-medium">
                      {r.label}
                    </span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted-foreground">
                      {r.does}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground/80">
                      Cannot: {r.cannot}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </Section>

        {/* Progressive disclosure of the consequence, in plain terms. */}
        <Section label="What happens next">
          <div className="space-y-3">
            <p className="text-[0.9375rem] leading-relaxed text-pretty">
              You will start on <strong>{selected.lands === "/ledger" ? "the public ledger" : `the ${selected.label.toLowerCase()} workspace`}</strong>, where
              you can {selected.does.replace(/\.$/, "").toLowerCase()}.
            </p>
            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              You can switch roles at any time from this page.
            </p>
          </div>
        </Section>

        {error && <Banner tone="error">{error}</Banner>}
        <LiveRegion message={error} assertive />

        <div className="border-t border-border pt-6">
          <Button
            size="lg"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => void submit()}
            className="w-full sm:w-auto"
          >
            {busy ? "Saving…" : `Continue as ${selected.label.toLowerCase()}`}
          </Button>
        </div>
      </Show>
    </PageShell>
  );
}
