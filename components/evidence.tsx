"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { EVIDENCE_META, type EvidenceKind } from "@/lib/civic";

export type EvidenceItem = {
  _id: string;
  kind: string;
  url?: string | null;
  userId?: string;
  userName?: string;
  userRole?: string;
  createdAt: number;
  note?: string;
};

function meta(kind: string) {
  return (EVIDENCE_META as Record<string, { label: string; blurb: string }>)[
    kind
  ] ?? { label: kind, blurb: "" };
}

function isKind(k: string): k is EvidenceKind {
  return k in EVIDENCE_META;
}

function date(iso: number) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function stamp(iso: number) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Provenance --------------------------------------------------------------- */

/**
 * Who filed a piece of proof, in what capacity, and when.
 *
 * This is the product's integrity claim made visible: the same photo is worth
 * more when you can see it came from the assigned contractor rather than a
 * passer-by, so the filer is always part of the frame's caption.
 */
function Provenance({
  item,
  className,
}: {
  item: EvidenceItem;
  className?: string;
}) {
  return (
    <p className={cn("text-xs leading-snug text-muted-foreground", className)}>
      <span className="text-foreground">{item.userName ?? "Unknown"}</span>
      {item.userRole && (
        <>
          {" · "}
          <span className="capitalize">{item.userRole}</span>
        </>
      )}
      {" · "}
      <span className="font-mono">{date(item.createdAt)}</span>
    </p>
  );
}

/* Lightbox ----------------------------------------------------------------- */

function Lightbox({
  item,
  onClose,
  onStep,
}: {
  item: EvidenceItem;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onStep]);

  const m = meta(item.kind);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${m.label} evidence`}
      className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-4 border-b border-border px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="text-[0.6875rem] leading-none font-semibold tracking-[0.09em] uppercase">
            {m.label}
          </div>
          <Provenance item={item} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="Previous photo"
            className="grid size-8 place-items-center rounded-[var(--radius)] border border-border text-sm hover:bg-muted"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label="Next photo"
            className="grid size-8 place-items-center rounded-[var(--radius)] border border-border text-sm hover:bg-muted"
          >
            →
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-[var(--radius)] border border-border px-2.5 py-1.5 text-[0.8125rem] font-medium hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {item.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={`${m.label} evidence`}
            className="max-h-full max-w-full rounded-[var(--radius)] object-contain"
          />
        )}
      </div>

      {item.note && (
        <p
          className="mx-auto max-w-2xl px-4 pb-5 text-center text-sm text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {item.note}
        </p>
      )}
    </div>
  );
}

/* Frames ------------------------------------------------------------------- */

function Frame({
  item,
  index,
  onOpen,
  className,
  size = "sm",
}: {
  item: EvidenceItem;
  index: number;
  onOpen: () => void;
  className?: string;
  size?: "sm" | "lg";
}) {
  const m = meta(item.kind);
  return (
    <figure className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group relative block w-full overflow-hidden rounded-[var(--radius)] border border-border bg-muted",
          "transition-[border-color,opacity] hover:border-foreground/40",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          size === "lg" ? "aspect-4/3" : "aspect-square",
        )}
      >
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={`${m.label} evidence`}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">
            No preview
          </span>
        )}
        <span
          className="absolute top-1 left-1 rounded-[2px] bg-background/85 px-1 font-mono text-[0.625rem] leading-[1.4] text-muted-foreground backdrop-blur-sm"
          aria-hidden
        >
          {String(index).padStart(2, "0")}
        </span>
        {size === "lg" && (
          <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent px-2.5 pt-8 pb-2 text-left text-[0.6875rem] font-semibold tracking-[0.08em] text-white uppercase">
            {m.label}
          </span>
        )}
      </button>
      {size === "sm" && (
        <figcaption className="mt-1.5 space-y-0.5">
          <div className="text-[0.6875rem] leading-none font-semibold tracking-[0.08em] uppercase">
            {m.label}
          </div>
          <Provenance item={item} />
        </figcaption>
      )}
    </figure>
  );
}

/* Proof pair --------------------------------------------------------------- */

/**
 * Before and after, side by side.
 *
 * The product's central claim is "don't take our word for it, look". That
 * comparison is the single most persuasive view in the app, so it is given the
 * most space and the strongest presentation anywhere.
 */
export function ProofPair({
  evidence,
  className,
}: {
  evidence: EvidenceItem[];
  className?: string;
}) {
  const [open, setOpen] = useState<EvidenceItem | null>(null);

  const before = evidence.filter((e) => e.kind === "before");
  const after = evidence.filter((e) => e.kind === "after");
  if (before.length === 0 || after.length === 0) return null;

  const sheet = [...evidence];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-5 sm:grid-cols-2">
        {(
          [
            ["Before", before],
            ["After", after],
          ] as const
        ).map(([label, items]) => {
          const latest = items[items.length - 1];
          const offset = label === "Before" ? 0 : before.length;
          return (
            <figure key={label} className="min-w-0">
              <figcaption className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[0.6875rem] leading-none font-semibold tracking-[0.1em] uppercase">
                  {label}
                </span>
                <span className="font-mono text-[0.6875rem] text-muted-foreground">
                  {items.length} frame{items.length === 1 ? "" : "s"}
                </span>
              </figcaption>
              <Frame
                item={latest}
                index={offset + items.length}
                onOpen={() => setOpen(latest)}
                size="lg"
              />
              <Provenance item={latest} className="mt-2" />
            </figure>
          );
        })}
      </div>
      {open && (
        <Lightbox
          item={open}
          onClose={() => setOpen(null)}
          onStep={(d) => {
            const i = sheet.findIndex((e) => e._id === open._id);
            setOpen(sheet[(i + d + sheet.length) % sheet.length]);
          }}
        />
      )}
    </div>
  );
}

/* Contact sheet ------------------------------------------------------------ */

/** Every frame on the case, grouped by the stage that produced it. */
export function ContactSheet({
  evidence,
  className,
}: {
  evidence: EvidenceItem[];
  className?: string;
}) {
  const [open, setOpen] = useState<EvidenceItem | null>(null);
  const sheet = evidence;

  const groups = (Object.keys(EVIDENCE_META) as EvidenceKind[])
    .filter(isKind)
    .map((kind) => ({
      kind,
      items: evidence.filter((e) => e.kind === kind),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No photographs on this case yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-7", className)}>
      {groups.map((g) => (
        <div key={g.kind} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
            <h3 className="text-[0.6875rem] leading-none font-semibold tracking-[0.1em] uppercase">
              {EVIDENCE_META[g.kind].label}
            </h3>
            <p className="text-xs text-muted-foreground">
              {EVIDENCE_META[g.kind].blurb}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((item) => (
              <Frame
                key={item._id}
                item={item}
                index={sheet.findIndex((e) => e._id === item._id) + 1}
                onOpen={() => setOpen(item)}
              />
            ))}
          </div>
        </div>
      ))}
      {open && (
        <Lightbox
          item={open}
          onClose={() => setOpen(null)}
          onStep={(d) => {
            const i = sheet.findIndex((e) => e._id === open._id);
            setOpen(sheet[(i + d + sheet.length) % sheet.length]);
          }}
        />
      )}
    </div>
  );
}

/** Detail pane for the reviewer, with a full timestamp. */
export function EvidenceStamp({ item }: { item: EvidenceItem }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[0.6875rem] leading-none font-semibold tracking-[0.08em] uppercase">
        {meta(item.kind).label}
      </div>
      <p className="text-xs text-muted-foreground">
        {item.userName}
        {item.userRole && <span className="capitalize"> · {item.userRole}</span>}
      </p>
      <p className="font-mono text-[0.6875rem] text-muted-foreground">
        {stamp(item.createdAt)}
      </p>
    </div>
  );
}
