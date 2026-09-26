"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, LocateFixed, Map as MapIcon } from "lucide-react";
import { useConvexAuth } from "convex/react";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { cn } from "@/lib/utils";

/**
 * The public infrastructure map (vision doc §17).
 *
 * Public and unauthenticated, like the ledger. MapLibre touches `window` and
 * WebGL at construction, so it is loaded client-side only — `ssr: false` is not
 * permitted in a Server Component, which is why this page carries "use client"
 * and the import is deferred rather than avoided.
 */
const CivicMap = dynamic(
  () => import("@/components/civic-map").then((m) => m.CivicMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="grid size-full place-items-center rounded-[var(--radius)] border bg-muted/40"
        role="status"
      >
        <span className="text-[0.8125rem] text-muted-foreground">
          Loading the map…
        </span>
      </div>
    ),
  },
);

export default function MapPage() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { center, supported, request, note } = useGeolocation();

  // Geolocation centres the map on the visitor. The fix arrives already
  // obfuscated by `useGeolocation`, so this never reveals a precise position to
  // the viewport query either.
  const [useMine, setUseMine] = useState(false);
  const canCentre = Boolean(center) && useMine;

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Public infrastructure map"
        title="The state of the city, as a record."
        description="Every reported problem, coloured by where it is in the chain of custody. Pins mark an area rather than a spot, because a citizen's exact location is never stored."
        actions={
          <Link
            href="/ledger"
            className={cn(buttonVariants({ variant: "outline" }), "min-h-9")}
          >
            <ArrowLeft />
            Ledger view
          </Link>
        }
      />

      <Section
        label="Live case map"
        aside={
          supported ? (
            <Button
              variant={useMine ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                // Toggling off returns to the city default; toggling on asks
                // again, because a first refusal is often a misclick.
                if (useMine) {
                  setUseMine(false);
                  return;
                }
                request();
                setUseMine(true);
              }}
            >
              <LocateFixed />
              {canCentre ? "Centred on you" : "Centre on me"}
            </Button>
          ) : null
        }
      >
        {note && (
          <p className="mb-3 text-[0.8125rem] text-muted-foreground">{note}</p>
        )}

        <div className="h-[min(70vh,40rem)] min-h-80 w-full overflow-hidden rounded-[var(--radius)] border">
          <CivicMap
            className="size-full"
            {...(canCentre
              ? { center: { lat: center!.lat, lng: center!.lng }, zoom: 13 }
              : {})}
            onSelect={(issueId) => router.push(`/issues/${issueId}`)}
          />
        </div>

        <p className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
          <MapIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Clusters group nearby cases at low zoom; click one to expand it, and
            click a pin to open the case file. Coordinates are randomised by up
            to 250&nbsp;m when a case is filed, so a dot identifies a
            neighbourhood rather than a kerb. The ledger view lists the same
            cases as text.
          </span>
        </p>
      </Section>

      {!isAuthenticated && (
        <p className="mt-6 text-[0.8125rem] text-muted-foreground">
          Spotted something on the way here?{" "}
          <Link href="/sign-up" className="font-medium underline underline-offset-2">
            Create an account
          </Link>{" "}
          to report it with photographic proof.
        </p>
      )}
    </PageShell>
  );
}
