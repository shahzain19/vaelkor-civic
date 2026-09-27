"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crosshair, MapPin, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORY_OPTIONS } from "@/components/status";
import { Banner, EmptyState, LiveRegion } from "@/components/feedback";
import { Field, FileDrop } from "@/components/form";
import { PageHeader, PageShell, Section } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGeolocation, type Coords } from "@/hooks/use-geolocation";
import { formatCoord, offsetCoords } from "@/lib/geo";
import { cn } from "@/lib/utils";

type Category = (typeof CATEGORY_OPTIONS)[number]["value"];

export default function CreatePostPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const router = useRouter();
  const createPost = useMutation(api.posts.create);
  const attachEvidence = useMutation(api.posts.attachEvidence);
  const generateUploadUrl = useMutation(api.evidence.generateUploadUrl);
  const listIssues = useQuery(api.issues.listRecent, { limit: 50 });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("road");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [manual, setManual] = useState<Coords | null>(null);
  const [nudge, setNudge] = useState(0);
  const [linkedIssueId, setLinkedIssueId] = useState<Id<"issues"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const submissionKey = useRef<string>("");

  const geo = useGeolocation();
  const devicePin = useMyLocation ? geo.reportPin : null;
  const pin = manual ?? devicePin;

  if (isLoading) {
    return (
      <PageShell width="narrow">
        <div className="h-64 animate-pulse rounded-[var(--radius)] bg-muted" />
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageShell width="narrow">
        <div className="pt-16">
          <EmptyState
            title="Sign in to post"
            body="Posts are tied to an account so confirmations count once per person."
            action={
              <div className="flex gap-2">
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
            }
          />
        </div>
      </PageShell>
    );
  }

  const problems: Record<string, string> = {};
  if (!body.trim()) problems.body = "Describe what you want to share.";
  if (!address.trim() && !pin) problems.location = "Set a location or enter an address.";
  if (!pin && !manual && !address.trim()) problems.location = "Set a location so others know where this is.";
  if (me?.role && me.role !== "citizen")
    problems.role = `You are signed in as a ${me.role}. Only citizens can post to the network.`;

  const valid = Object.keys(problems).length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || !pin) return;

    setSubmitting(true);
    setError(null);
    submissionKey.current ||= crypto.randomUUID();
    try {
      let storageId: Id<"_storage"> | undefined;
      if (file) {
        const url = await generateUploadUrl({});
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (!res.ok) throw new Error("The photograph did not upload. Try again.");
        const data = (await res.json()) as { storageId: Id<"_storage"> };
        storageId = data.storageId;
      }

      const postId = await createPost({
        title: title.trim() || undefined,
        body: body.trim(),
        category,
        lat: pin.lat,
        lng: pin.lng,
        address: address.trim() || undefined,
        issueId: linkedIssueId || undefined,
      });

      // The post exists before the photo is linked, so a failure here leaves a
      // readable post rather than a lost upload. The storage object is already
      // written; attaching it is a second, separately-authorized write.
      if (storageId) {
        await attachEvidence({ postId, storageId });
      }

      submissionKey.current = "";
      router.push(`/network/${postId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create post. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <PageShell width="narrow">
      <div className="pt-6">
        <Link
          href="/network"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Network
        </Link>
      </div>

      <PageHeader
        eyebrow="Civic Network"
        title="Create a post"
        description="Share what you see, ask a question, or link to an existing case. A post is public and counts as your voice in the network."
      />

      <form onSubmit={onSubmit} noValidate>
        <Section label="What happened?" rule>
          <div className="space-y-6">
            <Field
              label="Title (optional)"
              hint="A short headline. If left blank, the first line of your post becomes the title."
            >
              {(p) => (
                <Input
                  id={p.id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Road damage on University Road"
                  aria-describedby={p["aria-describedby"]}
                  className="resize-none"
                />
              )}
            </Field>

            <Field
              label="What happened?"
              required
              error={touched ? problems.body : null}
              hint="Describe the issue, update, or observation. Be specific — others nearby will read this."
            >
              {(p) => (
                <Textarea
                  id={p.id}
                  rows={5}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Large section of road damaged after recent construction. Two lanes affected near the bridge…"
                  aria-describedby={p["aria-describedby"]}
                  aria-invalid={p["aria-invalid"]}
                  required={p.required}
                  className="resize-y leading-relaxed"
                />
              )}
            </Field>

            <Field label="Category" required>
              {(p) => (
                <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                  <SelectTrigger className="h-9 w-full" id={p.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section label="Where">
          <div className="space-y-5">
            <Field
              label="Address or nearest landmark"
              error={touched ? problems.location : null}
              hint="More useful than coordinates. Helps others know the exact spot."
            >
              {(p) => (
                <Input
                  id={p.id}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="University Road, near the bridge"
                  aria-describedby={p["aria-describedby"]}
                  aria-invalid={p["aria-invalid"]}
                />
              )}
            </Field>

            <div className="space-y-3">
              <span className="text-[0.8125rem] font-medium">
                Position <span className="text-destructive">*</span>
              </span>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={useMyLocation ? "default" : "outline"}
                  disabled={!geo.supported || geo.locating}
                  onClick={() => {
                    setUseMyLocation(true);
                    setManual(null);
                    setNudge(0);
                  }}
                >
                  <MapPin />
                  {geo.locating ? "Locating…" : "Use my location"}
                </Button>
                <Button
                  type="button"
                  variant={manual ? "default" : "outline"}
                  onClick={() => {
                    setManual((m) => m ?? { lat: 0, lng: 0 });
                    setUseMyLocation(false);
                  }}
                >
                  <Crosshair />
                  Enter coordinates
                </Button>
              </div>

              {touched && problems.location && !pin && (
                <p className="text-xs font-medium text-destructive">{problems.location}</p>
              )}

              {pin && (
                <div className="space-y-3 rounded-[var(--radius)] border border-border bg-muted/40 p-3.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.8125rem]">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {formatCoord(pin.lat, pin.lng)}
                    <span className="font-sans text-xs text-muted-foreground">{geo.note}</span>
                  </p>

                  {devicePin && (
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <ShieldCheck className="mt-px size-3.5 shrink-0 text-status-resolved" />
                      <span>
                        Stored shifted by up to {geo.storePrivacyM} m so this post cannot be traced
                        to your home. Describe the spot in the address if the pin looks off.
                      </span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">Nudge the pin:</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setManual(offsetCoords(pin.lat, pin.lng, -50 + nudge, 90));
                        setUseMyLocation(false);
                      }}
                    >
                      ← 50 m
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setManual(offsetCoords(pin.lat, pin.lng, 100 + nudge, 90));
                        setUseMyLocation(false);
                      }}
                    >
                      100 m →
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setManual(offsetCoords(pin.lat, pin.lng, 300 + nudge, 90));
                        setUseMyLocation(false);
                      }}
                    >
                      300 m →
                    </Button>
                  </div>
                </div>
              )}

              {manual && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="lat" className="text-xs text-muted-foreground">Latitude</label>
                    <Input
                      id="lat"
                      type="number"
                      step="any"
                      value={manual.lat}
                      onChange={(e) => setManual({ ...manual, lat: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="lng" className="text-xs text-muted-foreground">Longitude</label>
                    <Input
                      id="lng"
                      type="number"
                      step="any"
                      value={manual.lng}
                      onChange={(e) => setManual({ ...manual, lng: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section label="Optional: Link to an existing case">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If this post is about a case already in the ledger, link it here. The post will show the
              case&apos;s live status, work order, and before/after evidence.
            </p>
            <Field label="Linked case">
              {(p) => (
                <Select value={linkedIssueId ?? ""} onValueChange={(v) => setLinkedIssueId((v || null) as Id<"issues"> | null)}>
                  <SelectTrigger className="h-9 w-full" id={p.id}>
                    <SelectValue placeholder="Select a case…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {listIssues?.map((issue) => (
                      <SelectItem key={issue._id} value={issue._id}>
                        {issue.caseNumber} — {issue.title} ({issue.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section label="Evidence (optional)">
          <div className="space-y-4">
            <Field
              label="Photograph"
              hint="Add a photo of what you're posting about. JPG or PNG, from your camera or library."
            >
              {(p) => (
                <FileDrop
                  id={p.id}
                  accept="image/*"
                  capture="environment"
                  disabled={submitting}
                  describedBy={p["aria-describedby"]}
                  onSelect={setFile}
                  fileName={file?.name}
                />
              )}
            </Field>
          </div>
        </Section>

        {touched && problems.role && <Banner tone="error">{problems.role}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        <LiveRegion message={error} assertive />

        <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:px-0">
          <p className="hidden text-xs text-muted-foreground sm:block">
            Published immediately and publicly. Confirmations are one per person.
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={submitting || !valid}
            aria-busy={submitting || undefined}
            className={cn("w-full sm:w-auto", !touched && "min-h-9")}
          >
            {submitting ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}