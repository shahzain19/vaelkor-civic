import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { AlertCircle, Check, Inbox, Info, RotateCw } from "lucide-react";

/* Loading ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[3px] bg-muted", className)}
    />
  );
}

/** Screen-reader-only status for async regions. */
export function LiveRegion({
  message,
  assertive = false,
}: {
  message: string | null | undefined;
  assertive?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live={assertive ? "assertive" : "polite"}
      className="sr-only"
    >
      {message}
    </div>
  );
}

/* Empty + error ------------------------------------------------------------ */

export function EmptyState({
  title,
  body,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2.5 rounded-[var(--radius)] border border-dashed border-input px-5 py-8",
        className,
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      <p className="text-[0.9375rem] font-medium">{title}</p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  body,
  onRetry,
  className,
}: {
  title?: string;
  body: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2.5 rounded-[var(--radius)] border border-destructive/25 bg-destructive/[0.04] px-5 py-5",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="size-4" />
        <p className="text-[0.9375rem] font-medium">{title}</p>
      </div>
      <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}

/* Inline status ------------------------------------------------------------ */

const BANNER_TONE = {
  info: "border-border bg-muted/50 text-foreground",
  success: "border-status-resolved/25 bg-status-resolved/[0.05] text-foreground",
  error: "border-destructive/25 bg-destructive/[0.04] text-foreground",
  warning: "border-status-confirmed/30 bg-status-confirmed/[0.06] text-foreground",
} as const;

const BANNER_ICON = {
  info: Info,
  success: Check,
  error: AlertCircle,
  warning: AlertCircle,
} as const;

const BANNER_ICON_TONE = {
  info: "text-muted-foreground",
  success: "text-status-resolved",
  error: "text-destructive",
  warning: "text-status-confirmed",
} as const;

/**
 * Inline confirmation of a completed or failed action. Success stays on screen
 * long enough to be read, and errors are announced assertively.
 */
export function Banner({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof BANNER_TONE;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = BANNER_ICON[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius)] border px-3.5 py-2.5 text-sm",
        BANNER_TONE[tone],
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", BANNER_ICON_TONE[tone])} />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

/* Actions ------------------------------------------------------------------ */

/**
 * A primary action that owns its own pending, disabled and blocked states.
 *
 * When an action is unavailable the reason is rendered as visible text rather
 * than a tooltip, so it is reachable on touch and by screen readers instead of
 * only on hover.
 */
export function ActionButton({
  children,
  onClick,
  pending,
  pendingLabel,
  blockedReason,
  variant = "default",
  size = "default",
  className,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  pending?: boolean;
  pendingLabel?: string;
  blockedReason?: string | null;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const blocked = Boolean(blockedReason) || Boolean(disabled) || Boolean(pending);
  const label = pending && pendingLabel ? pendingLabel : children;

  return (
    <div className={cn(blockedReason && "space-y-1.5", className)}>
      <Button
        type={type}
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={blocked}
        aria-busy={pending || undefined}
        className={cn(
          // Comfortable touch target on small screens without inflating the
          // desktop density.
          "h-8 sm:h-8 min-h-9 sm:min-h-0",
          blockedReason && "w-full sm:w-auto",
        )}
      >
        {label}
      </Button>
      {blockedReason && (
        <p className="max-w-[46ch] text-xs leading-relaxed text-muted-foreground">
          {blockedReason}
        </p>
      )}
    </div>
  );
}
