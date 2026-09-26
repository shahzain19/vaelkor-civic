"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { LocateFixed, Plus, Search, ShieldCheck, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CATEGORY_OPTIONS } from "@/components/status";
import { CaseLedger, type CaseSummary } from "@/components/case-list";
import { EmptyState } from "@/components/feedback";
import { PageHeader, PageShell, ScrollRow } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGeolocation } from "@/hooks/use-geolocation";
import { LOCATION_PRIVACY_QUERY_M } from "@/lib/geo";
import { cn } from "@/lib/utils";

const NEARBY_RADIUS_KM = 25;

const STAGES = [
  { value: "live", label: "Live" },
  { value: "unassigned", label: "Unassigned" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;

const LIVE = new Set([
  "reported",
  "confirmed",
  "verified",
  "open",
  "claimed",
  "in_progress",
  "completion_submitted",
  "inspection",
]);

export default function LedgerPage() {
  const { center, locating, supported, note, request, distanceToKm } =
    useGeolocation();

  // Absorb the privacy offset so no case is hidden near the edge of the
  // citizen's real area.
  const radiusKm = NEARBY_RADIUS_KM + LOCATION_PRIVACY_QUERY_M / 1000;

  const nearby = useQuery(
    api.issues.listNearby,
    center ? { lat: center.lat, lng: center.lng, radiusKm } : "skip",
  );
  const recent = useQuery(api.issues.listRecent, center ? "skip" : { limit: 50 });

  const [stage, setStage] = useState<(typeof STAGES)[number]["value"]>("live");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const cases = useMemo<CaseSummary[]>(() => {
    const rows = center
      ? (nearby ?? []).map((i) => ({
          ...i,
          // Recomputed in memory so the label is accurate without the raw
          // device fix ever leaving the browser.
          distanceKm: distanceToKm(i.lat, i.lng) ?? undefined,
        }))
      : (recent ?? []).map((i) => ({ ...i, distanceKm: undefined }));

    if (center) {
      rows.sort(
        (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
      );
    }
    return rows;
  }, [center, nearby, recent, distanceToKm]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (stage === "live" && !LIVE.has(c.status)) return false;
      if (stage === "unassigned" && c.status !== "open") return false;
      if (stage === "closed" && c.status !== "closed") return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.caseNumber.toLowerCase().includes(q)
      );
    });
  }, [cases, category, stage, query]);

  const loading = center ? nearby === undefined : recent === undefined;
  const filtering = stage !== "all" || category !== "all" || query.trim() !== "";
  const hasDistance = filtered.some((c) => c.distanceKm !== undefined);

  function clearAll() {
    setStage("all");
    setCategory("all");
    setQuery("");
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Public works ledger"
        title="Every problem, verified in public."
        description="Anyone can report what is broken. Neighbours confirm it. A work order opens, a contractor proves the work, and an inspector signs it off — with photographs at each step."
        actions={
          <Link
            href="/report"
            className={cn(buttonVariants({ size: "lg" }), "min-h-9")}
          >
            <Plus />
            Report a problem
          </Link>
        }
      />

      {/* Toolbar sticks so filtering stays available while scrolling a long
          ledger. */}
      <div className="sticky top-(--header-h) z-30 -mx-4 border-y border-border bg-background/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cases, addresses, case numbers"
              aria-label="Search cases"
              className="h-8 pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-[3px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="seg shrink-0" role="group" aria-label="Stage">
              {STAGES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  data-active={stage === s.value}
                  aria-pressed={stage === s.value}
                  onClick={() => setStage(s.value)}
                  className="seg-item"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger
                className="h-8 w-[9.5rem] shrink-0 text-[0.8125rem]"
                aria-label="Filter by problem type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Feed context: where the rows came from and what privacy applies. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
        <p className="text-[0.8125rem] text-muted-foreground">
          {loading ? (
            "Loading cases…"
          ) : (
            <>
              <span className="font-mono text-foreground">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "case" : "cases"}
              {hasDistance
                ? ` within ${NEARBY_RADIUS_KM} km, nearest first`
                : " most recent first"}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <LocateFixed
            className={cn(
              "size-3.5",
              center ? "text-status-resolved" : "text-muted-foreground",
            )}
            aria-hidden
          />
          <span className="text-xs text-muted-foreground">{note}</span>
          {supported && !center && !locating && (
            <Button variant="link" size="xs" onClick={request}>
              Use my location
            </Button>
          )}
        </div>
      </div>

      {center && (
        <p className="mb-5 flex items-start gap-2 rounded-[var(--radius)] border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck
            className="mt-px size-3.5 shrink-0 text-status-resolved"
            aria-hidden
          />
          <span>
            Your exact location is never uploaded. Searches run from a point
            shifted up to {LOCATION_PRIVACY_QUERY_M} m away, so no one can work
            out which street you live on. Distances shown are still measured
            from your real position.
          </span>
        </p>
      )}

      {loading ? (
        <CaseLedger skeletonCount={6} />
      ) : cases.length === 0 ? (
        <EmptyState
          title="The ledger is empty"
          body="No problems have been reported yet. Reporting one takes a photo and a location, and your report counts as the first confirmation."
          icon={Plus}
          action={
            <Link href="/report" className={buttonVariants()}>
              Report the first problem
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No cases match those filters"
          body={`All ${cases.length} visible case${cases.length === 1 ? "" : "s"} fall outside this combination. Widen the stage or type filter to see more.`}
          icon={Search}
          action={
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <CaseLedger issues={filtered} showDistance={hasDistance} />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {cases.length}
            </p>
            {filtering && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X />
                Reset filters
              </Button>
            )}
          </div>
        </>
      )}

      <ScrollRow className="mt-12 justify-center pb-2">
        <p className="text-center text-xs text-muted-foreground">
          Reports require a photo. Confirmations are one per person. Cases close
          only on inspector sign-off.
        </p>
      </ScrollRow>
    </PageShell>
  );
}
