"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { Camera, MapPin, Plus, Search, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { NETWORK_FILTERS, categoryShort, affectedLabel, type NetworkFilter } from "@/lib/civic";
import { CaseRef, PhaseRail, StatusTag } from "@/components/status";
import { EmptyState } from "@/components/feedback";
import { PageHeader, PageShell, ScrollRow } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EvidenceItem, ProofPair } from "@/components/evidence";
import { formatDistance } from "@/lib/geo";
import { useGeolocation } from "@/hooks/use-geolocation";
import { LOCATION_PRIVACY_QUERY_M } from "@/lib/geo";

const NEARBY_RADIUS_KM = 25;

type PostSummary = {
  _id: string;
  title: string;
  body: string;
  category: string;
  authorId: string;
  authorName: string;
  lat?: number;
  lng?: number;
  address?: string;
  issueId?: string;
  confirmationCount: number;
  commentCount: number;
  evidenceCount: number;
  createdAt: number;
  distanceKm?: number;
  linkedCase?: {
    issueId: string;
    caseNumber: string;
    status: string;
    address: string;
    workOrder?: {
      id: string;
      status: string;
      contractorName: string | null;
    } | null;
    beforeUrl: string | null;
    afterUrl: string | null;
  } | null;
  affectedByMe: boolean;
  viewerId?: string | null;
};

const PostSkeleton = () => (
  <div className="border-b border-border py-5">
    <div className="grid grid-cols-[1fr] md:grid-cols-[3rem_5rem_minmax(0,1fr)_auto_7rem] gap-4">
      <div className="h-3 w-16 animate-pulse rounded-[3px] bg-muted" />
      <div className="h-2.5 w-10 animate-pulse rounded-[3px] bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-3/4 animate-pulse rounded-[3px] bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded-[3px] bg-muted" />
      </div>
      <div className="hidden md:block">
        <div className="h-[3px] w-16 animate-pulse rounded-[1px] bg-muted" />
        <div className="h-2.5 w-16 animate-pulse rounded-[3px] bg-muted" />
      </div>
    </div>
    <div className="mt-3 h-20 animate-pulse rounded-[var(--radius)] bg-muted" />
  </div>
);

export default function NetworkPage() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { center, locating, supported, note, request } = useGeolocation();
  const radiusKm = NEARBY_RADIUS_KM + LOCATION_PRIVACY_QUERY_M / 1000;

  const [filter, setFilter] = useState<NetworkFilter>(null);
  const [view, setView] = useState<"feed" | "map">("feed");
  const [query, setQuery] = useState("");

  const feed = useQuery(api.posts.list, {
    category: filter ?? undefined,
    lat: center?.lat,
    lng: center?.lng,
    radiusKm,
    limit: 20,
  });

  const loading = authLoading || feed === undefined;
  const hasDistance = feed?.posts.some((p) => p.distanceKm !== undefined) ?? false;
  const posts = useMemo(() => feed?.posts ?? [], [feed]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.linkedCase?.caseNumber.toLowerCase().includes(q)
      );
    });
  }, [posts, query]);

  function clearFilters() {
    setFilter(null);
    setQuery("");
  }

  if (authLoading) {
    return (
      <PageShell width="wide">
        <PageHeader
          eyebrow="Civic Network"
          title="What the community is seeing"
          description="Citizens report problems, share updates, and track progress. Every post is public — no account needed to read."
        />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => <PostSkeleton key={i} />)}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Civic Network"
        title="What the community is seeing"
        description="Citizens report problems, share updates, and track progress. Every post is public — no account needed to read."
        actions={
          isAuthenticated ? (
            <Link href="/network/create" className={buttonVariants({ size: "lg" })}>
              <Plus />
              Create post
            </Link>
          ) : (
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              <Plus />
              Join to post
            </Link>
          )
        }
      />

      {/* Toolbar */}
      <div className="sticky top-(--header-h) z-30 -mx-4 border-y border-border bg-background/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts, addresses, case numbers"
              aria-label="Search posts"
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
            <div className="seg shrink-0" role="group" aria-label="Category filter">
              {NETWORK_FILTERS.map((f) => (
                <button
                  key={f.value ?? "all"}
                  type="button"
                  data-active={filter === f.value}
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className="seg-item"
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="seg shrink-0" role="group" aria-label="View">
              <button
                type="button"
                data-active={view === "feed"}
                aria-pressed={view === "feed"}
                onClick={() => setView("feed")}
                className="seg-item inline-flex items-center gap-1.5"
              >
                <Camera className="size-3.5" aria-hidden />
                Feed
              </button>
              <button
                type="button"
                data-active={view === "map"}
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
                className="seg-item inline-flex items-center gap-1.5"
              >
                <MapPin className="size-3.5" aria-hidden />
                Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed context */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
        <p className="text-[0.8125rem] text-muted-foreground">
          {loading ? (
            "Loading posts…"
          ) : (
            <>
              <span className="font-mono text-foreground">{filteredPosts.length}</span>{" "}
              {filteredPosts.length === 1 ? "post" : "posts"}
              {view === "map"
                ? " in and around the viewport"
                : hasDistance
                ? ` within ${NEARBY_RADIUS_KM} km, nearest first`
                : " most recent first"}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <MapPin className={cn("size-3.5", center ? "text-status-resolved" : "text-muted-foreground")} aria-hidden />
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
          <MapPin className="mt-px size-3.5 shrink-0 text-status-resolved" aria-hidden />
          <span>
            Your exact location is never uploaded. Searches run from a point shifted up to {LOCATION_PRIVACY_QUERY_M} m away. Distances shown are still measured from your real position.
          </span>
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3, 4].map((i) => <PostSkeleton key={i} />)}
        </div>
      ) : filteredPosts.length === 0 ? (
        <EmptyState
          title={posts.length === 0 ? "The network is empty" : "No posts match those filters"}
          body={
            posts.length === 0
              ? "No one has posted yet. Be the first to share what you see on your street."
              : `All ${posts.length} visible post${posts.length === 1 ? "" : "s"} fall outside this combination. Widen the filter or clear search to see more.`
          }
          icon={Camera}
          action={
            <Button variant="outline" onClick={clearFilters}>
              <X />
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-0">
            {filteredPosts.map((post) => (
              <PostCard key={post._id} post={post} viewerId={feed?.viewerId ?? null} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="text-xs text-muted-foreground">
              Showing {filteredPosts.length} of {posts.length}
            </p>
            {(query || filter) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X />
                Reset filters
              </Button>
            )}
          </div>
        </>
      )}

      <ScrollRow className="mt-12 justify-center pb-2">
        <p className="text-center text-xs text-muted-foreground">
          Posts are public. Confirmations are one per person. Linked cases show live status and evidence.
        </p>
      </ScrollRow>
    </PageShell>
  );
}

function PostCard({
  post,
  viewerId,
}: {
  post: PostSummary;
  viewerId: string | null;
}) {
  const hasDistance = post.distanceKm !== undefined;
  const linked = post.linkedCase;
  const isMine = viewerId !== null && post.authorId === viewerId;

  const evidence = useMemo((): EvidenceItem[] => {
    const items: EvidenceItem[] = [];
    if (linked?.beforeUrl) {
      items.push({
        _id: `${post._id}-before`,
        kind: "before",
        url: linked.beforeUrl,
        createdAt: post.createdAt,
        userName: "Work order",
      });
    }
    if (linked?.afterUrl) {
      items.push({
        _id: `${post._id}-after`,
        kind: "after",
        url: linked.afterUrl,
        createdAt: post.createdAt,
        userName: "Work order",
      });
    }
    return items;
  }, [post, linked]);

  return (
    <Link
      href={`/network/${post._id}`}
      className="block border-b border-border py-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="grid grid-cols-[1fr] md:grid-cols-[3rem_5rem_minmax(0,1fr)_auto_7rem] gap-4">
        {/* Category + Author */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] font-medium tracking-[0.07em] text-muted-foreground uppercase">
              {categoryShort(post.category)}
            </span>
            <StatusTag status={linked?.status ?? "reported"} emphasis />
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {post.authorName}
            {isMine ? " · you" : ""}
          </p>
        </div>

        <div className="hidden min-w-0 md:block">
          <span className="text-[0.6875rem] font-medium tracking-[0.07em] text-muted-foreground uppercase">
            {categoryShort(post.category)}
          </span>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {post.authorName}
            {isMine ? " · you" : ""}
          </p>
        </div>

        {/* Confirmations */}
        <div className={cn("md:hidden", hasDistance && "flex items-center justify-between")}>
          <span className="text-[0.8125rem] font-medium">
            {affectedLabel(post.confirmationCount)}
          </span>
          {hasDistance && (
            <span className="font-mono text-[0.75rem] text-muted-foreground">
              {formatDistance(post.distanceKm ?? NaN)}
            </span>
          )}
        </div>
        <div className="hidden md:block">
          <span className="text-[0.8125rem] font-medium">
            {affectedLabel(post.confirmationCount)}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] leading-snug font-medium text-pretty">
            {post.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[0.8125rem] text-muted-foreground">
            {post.body}
          </p>
          {post.address && (
            <p className="mt-1 truncate text-[0.8125rem] text-muted-foreground">
              <MapPin className="inline size-3" aria-hidden /> {post.address}
            </p>
          )}
        </div>

        {/* Distance */}
        {hasDistance && (
          <div className="hidden text-right font-mono text-[0.75rem] text-muted-foreground md:block">
            {formatDistance(post.distanceKm ?? NaN)}
          </div>
        )}

        {/* Status / Phase */}
        <div className="hidden md:block text-right">
          {linked ? (
            <>
              <PhaseRail status={linked.status} labels={false} />
              <StatusTag status={linked.status} emphasis className="mt-1.5" />
              {linked.workOrder && (
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  Work order: {linked.workOrder.status}
                </p>
              )}
            </>
          ) : (
            <span className="text-[0.6875rem] text-muted-foreground">Standalone</span>
          )}
        </div>
      </div>

      {/* Linked case badge + Proof pair */}
      {linked && (
        <div className="mt-4 grid gap-4 md:grid-cols-[3rem_5rem_minmax(0,1fr)_auto_7rem]">
          <div className="md:col-span-2" />
          <div className="md:col-span-3">
            <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius)] border border-border bg-muted/40 px-3 py-2.5">
              <CaseRef value={linked.caseNumber} className="text-foreground" />
              <span className="text-[0.6875rem] text-muted-foreground">Linked case</span>
              {linked.workOrder && (
                <>
                  <span className="text-[0.6875rem] text-muted-foreground">→</span>
                  <span className="text-[0.6875rem] font-medium">
                    Work order {linked.workOrder.status}
                  </span>
                </>
              )}
            </div>
            {evidence.length === 2 && <ProofPair evidence={evidence} className="mt-3" />}
          </div>
        </div>
      )}
    </Link>
  );
}