import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CONFIRMATION_THRESHOLD,
  PHASES,
  categoryLabel,
  categoryShort,
  phaseIndex,
  statusLabel,
  toneFor,
  TONE_CLASS,
  TONE_DOT,
  type Tone,
} from "@/lib/civic";

export { CATEGORIES, categoryLabel, categoryShort, statusLabel };
export const CATEGORY_OPTIONS = CATEGORIES;

/* Phase rail --------------------------------------------------------------- */

/**
 * Lifecycle position, drawn as five segments rather than a badge.
 *
 * Nine raw states collapse into five phases, which is what the product actually
 * talks about. The rail answers "how far along is this, and what happens next"
 * in one glance and costs ~4px of height.
 */
export function PhaseRail({
  status,
  labels = true,
  className,
}: {
  status: string;
  labels?: boolean;
  className?: string;
}) {
  const current = phaseIndex(status);
  const phase = PHASES[current];

  if (!labels) {
    return (
      <span
        role="img"
        aria-label={`Stage ${current + 1} of ${PHASES.length}: ${phase.label}`}
        className={cn("flex items-center gap-[3px]", className)}
      >
        {PHASES.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              "h-[3px] w-3 rounded-[1px] transition-colors",
              i < current && "bg-foreground/45",
              i === current && "bg-foreground",
              i > current && "bg-border",
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-[3px]" aria-hidden>
        {PHASES.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              "h-[3px] flex-1 rounded-[1px] transition-colors",
              i < current && "bg-foreground/45",
              i === current && "bg-foreground",
              i > current && "bg-border",
            )}
          />
        ))}
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-1">
        {PHASES.map((p, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={p.key}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 text-[0.6875rem] leading-none font-medium tracking-[0.06em] uppercase",
                active
                  ? "text-foreground"
                  : done
                    ? "text-muted-foreground"
                    : "text-muted-foreground/55",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  done
                    ? "bg-foreground/45"
                    : active
                      ? "bg-foreground"
                      : "border border-current",
                )}
              />
              {p.label}
            </li>
          );
        })}
      </ol>

      <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
        {phase.blurb}
      </p>
    </div>
  );
}

/* Status tag --------------------------------------------------------------- */

/**
 * Lifecycle state. Kept quiet — a dot and a mono label, no filled pill — so that
 * colour carries meaning and the tag does not become visual noise in a list.
 */
export function StatusTag({
  status,
  emphasis = false,
  className,
}: {
  status: string;
  emphasis?: boolean;
  className?: string;
}) {
  const tone: Tone = toneFor(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[0.6875rem] leading-none font-semibold tracking-[0.07em] whitespace-nowrap uppercase",
        emphasis ? "rounded-[var(--radius-sm)] px-1.5 py-1" : "",
        emphasis && TONE_CLASS[tone],
        !emphasis && "text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
        aria-hidden
      />
      {statusLabel(status)}
    </span>
  );
}

const PRIORITY_TONE: Record<string, Tone> = {
  high: "broken",
  medium: "active",
  low: "confirmed",
};

export function PriorityTag({
  priority,
  className,
}: {
  priority: string;
  className?: string;
}) {
  const tone = PRIORITY_TONE[priority] ?? "confirmed";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[0.6875rem] leading-none font-semibold tracking-[0.07em] whitespace-nowrap uppercase",
        "text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
      {priority}
    </span>
  );
}

/* Tally -------------------------------------------------------------------- */

/**
 * Confirmation progress as countable marks.
 *
 * Three confirmations open a work order — that threshold is the mechanism the
 * whole product turns on, so it is shown as something you can count at a
 * glance rather than a progress bar that has to be interpreted.
 */
export function Tally({
  count,
  threshold = CONFIRMATION_THRESHOLD,
  showCount = true,
  className,
}: {
  count: number;
  threshold?: number;
  showCount?: boolean;
  className?: string;
}) {
  const reached = count >= threshold;
  const remaining = Math.max(0, threshold - count);

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={
        reached
          ? "Verified — a work order has been opened"
          : `${remaining} more confirmation${remaining === 1 ? "" : "s"} needed to open a work order`
      }
    >
      <span className="flex items-end gap-[2px]" aria-hidden>
        {Array.from({ length: threshold }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px] transition-colors",
              i < count ? "h-2.5 bg-foreground" : "h-2 bg-border",
            )}
          />
        ))}
      </span>
      {showCount && (
        <span
          className={cn(
            "font-mono text-[0.75rem] leading-none",
            reached ? "text-status-resolved" : "text-muted-foreground",
          )}
        >
          {reached ? "verified" : `${count}/${threshold}`}
        </span>
      )}
      <span className="sr-only">
        {reached
          ? "Verified. A work order is open."
          : `${count} of ${threshold} confirmations.`}
      </span>
    </span>
  );
}

/* Case identifier ---------------------------------------------------------- */

/** `CIV-000142` — the primary handle for a case. Always mono. */
export function CaseRef({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={cn("font-mono text-[0.75rem] tracking-tight", className)}>
      {value}
    </span>
  );
}
