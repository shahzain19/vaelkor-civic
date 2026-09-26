import { cn } from "@/lib/utils";

/**
 * Page scaffolding.
 *
 * The page itself is the canvas. Sections are divided by hairlines and
 * whitespace, so the document reads top-to-bottom like a record rather than a
 * stack of floating cards.
 */

const WIDTHS = {
  default: "max-w-[68rem]",
  wide: "max-w-[84rem]",
  narrow: "max-w-[44rem]",
} as const;

export function PageShell({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-6", WIDTHS[width], className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5 pt-8 pb-6 sm:pt-10 sm:pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-10",
        className,
      )}
    >
      <div className="min-w-0 max-w-[54ch]">
        {eyebrow && <div className="eyebrow mb-2.5">{eyebrow}</div>}
        <h1 className="text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.022em] text-balance sm:text-[2rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/**
 * A labelled block. `rule` draws the hairline that separates it from the
 * previous section — the main structural device of the whole interface.
 */
export function Section({
  label,
  aside,
  rule = true,
  className,
  bodyClassName,
  children,
}: {
  label?: React.ReactNode;
  aside?: React.ReactNode;
  rule?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        rule && "border-t border-border",
        "pt-6 pb-8 sm:pt-7",
        className,
      )}
    >
      {(label || aside) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {label && <h2 className="eyebrow">{label}</h2>}
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Label/value pair for factual data. Values use mono so they align. */
export function Meta({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <dt className="shrink-0 text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[0.8125rem] text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function MetaList({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {label && <div className="eyebrow mb-2">{label}</div>}
      <dl className="divide-y divide-border/70 border-y border-border/70">
        {children}
      </dl>
    </div>
  );
}

/** Horizontally scrollable strip, so filter rows never wrap awkwardly. */
export function ScrollRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
