"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Crosshair,
  LocateFixed,
  MapPin,
  ShieldCheck,
} from "lucide-react";
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

const SEVERITY = [
  { value: "low", label: "Low", hint: "Cosmetic or inconvenient" },
  { value: "medium", label: "Medium", hint: "Needs repair, still usable" },
  { value: "high", label: "High", hint: "Unsafe or blocking" },
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number]["value"];
type Severity = (typeof SEVERITY)[number]["value"];

export default function ReportPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const router = useRouter();
  const createIssue = useMutation(api.issues.create);
  const generateUploadUrl = useMutation(api.evidence.generateUploadUrl);

  const [category, setCategory] = useState<Category>("road");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [address, setAddress] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [manual, setManual] = useState<Coords | null>(null);
  const [nudge, setNudge] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  /**
   * Stable for the whole attempt, so a retry after a dropped response is
   * recognised as the same submission instead of filing a second case. Only a
   * success mints a new one.
   */
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
            title="Sign in to report"
            body="Reports are tied to an account so a confirmation counts once per person, and so a contractor cannot supply their own proof."
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

  if (me && !me.role) {
    return (
      <PageShell width="narrow">
        <div className="pt-16">
          <EmptyState
            title="Choose how you take part"
            body="Reporting is a citizen action. Pick the citizen role to continue."
            action={
              <Link
                href="/onboarding"
                className="rounded-[var(--radius)] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Choose a role
              </Link>
            }
          />
        </div>
      </PageShell>
    );
  }

  const problems: Record<string, string> = {};
  if (!description.trim()) problems.description = "Describe what is wrong.";
  if (!address.trim()) problems.address = "Name the street or nearest landmark.";
  if (!pin) problems.location = "Set a location so a crew can find it.";
  if (!file) problems.photo = "A photograph is required.";
  if (me?.role && me.role !== "citizen")
    problems.role = `You are signed in as a ${me.role}. Only citizens can report.`;

  const valid = Object.keys(problems).length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || !pin || !file) return;

    setSubmitting(true);
    setError(null);
    // Minted lazily: a report the citizen abandons never consumes a key.
    submissionKey.current ||= crypto.randomUUID();
    try {
      const url = await generateUploadUrl({});
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!res.ok) throw new Error("The photograph did not upload. Try again.");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const issueId = await createIssue({
        category,
        description: description.trim(),
        severity,
        lat: pin.lat,
        lng: pin.lng,
        address: address.trim(),
        storageId,
        idempotencyKey: submissionKey.current,
      });
      // The case exists, so the next submission is genuinely a new report.
      submissionKey.current = "";
      router.push(`/issues/${issueId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not file the report. Try again.",
      );
      setSubmitting(false);
    }
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

      <PageHeader
        eyebrow="Citizen"
        title="Report a problem"
        description="A photograph and a location are required. Your report is published immediately and counts as the first confirmation."
      />

      <form onSubmit={onSubmit} noValidate>
        <Section label="What is wrong" rule>
          <div className="space-y-6">
            <Field
              label="Type"
              required
              hint="This sets the default scope a contractor will be given."
            >
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

            <Field
              label="Description"
              required
              error={touched ? problems.description : null}
              hint="What you can see, and anything that makes it urgent."
            >
              {(p) => (
                <Textarea
                  id={p.id}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deep pothole across roughly one lane, about a car width…"
                  aria-describedby={p["aria-describedby"]}
                  aria-invalid={p["aria-invalid"]}
                  required={p.required}
                  className="resize-y leading-relaxed"
                />
              )}
            </Field>

            <Field label="Severity" required>
              {(p) => (
                <div className="seg w-full" role="group" aria-labelledby={p.id}>
                  {SEVERITY.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      data-active={severity === s.value}
                      aria-pressed={severity === s.value}
                      onClick={() => setSeverity(s.value)}
                      title={s.hint}
                      className="seg-item flex-1"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>
        </Section>

        <Section label="Where">
          <div className="space-y-5">
            <Field
              label="Address or nearest landmark"
              required
              error={touched ? problems.address : null}
              hint="More useful to a crew than coordinates, and it is public."
            >
              {(p) => (
                <Input
                  id={p.id}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Kokuvilady 4th cross, near the temple"
                  aria-describedby={p["aria-describedby"]}
                  aria-invalid={p["aria-invalid"]}
                  required={p.required}
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
                  <LocateFixed />
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
                <p className="text-xs font-medium text-destructive">
                  {problems.location}
                </p>
              )}

              {pin && (
                <div className="space-y-3 rounded-[var(--radius)] border border-border bg-muted/40 p-3.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.8125rem]">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    {formatCoord(pin.lat, pin.lng)}
                    <span className="font-sans text-xs text-muted-foreground">
                      {geo.note}
                    </span>
                  </p>

                  {devicePin && (
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                      <ShieldCheck className="mt-px size-3.5 shrink-0 text-status-resolved" />
                      <span>
                        Stored shifted by up to {geo.storePrivacyM} m so this
                        case cannot be traced to your home. Describe the spot in
                        the address if the pin looks off.
                      </span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      Nudge the pin:
                    </span>
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
                    <label
                      htmlFor="lat"
                      className="text-xs text-muted-foreground"
                    >
                      Latitude
                    </label>
                    <Input
                      id="lat"
                      type="number"
                      step="any"
                      value={manual.lat}
                      onChange={(e) =>
                        setManual({ ...manual, lat: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="lng"
                      className="text-xs text-muted-foreground"
                    >
                      Longitude
                    </label>
                    <Input
                      id="lng"
                      type="number"
                      step="any"
                      value={manual.lng}
                      onChange={(e) =>
                        setManual({ ...manual, lng: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section label="Evidence">
          <div className="space-y-4">
            <Field
              label="Photograph"
              required
              error={touched ? problems.photo : null}
              hint="The single most important part of the report. Show the problem clearly."
            >
              {(p) => (
                <FileDrop
                  id={p.id}
                  accept="image/*"
                  capture="environment"
                  disabled={submitting}
                  invalid={Boolean(touched && problems.photo)}
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
            Published immediately and publicly.
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            aria-busy={submitting || undefined}
            className={cn("w-full sm:w-auto", !touched && "min-h-9")}
          >
            {submitting ? "Filing report…" : "File report"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
