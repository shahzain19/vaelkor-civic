"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Form field scaffolding.
 *
 * Every field states what is expected, whether it is required, and what happens
 * next. Error text is wired through `aria-describedby` and `aria-invalid` so it
 * is announced, not just coloured.
 */
export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  labelSuffix,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    required?: boolean;
  }) => React.ReactNode;
  className?: string;
  labelSuffix?: React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-[0.8125rem] font-medium">
          {label}
          {required && (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
        {labelSuffix}
      </div>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs leading-relaxed font-medium text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Upload target. A real file input kept visually intact so its affordance
 *  and mobile camera behaviour are not reimplemented by hand. */
export function FileDrop({
  id,
  accept = "image/*",
  capture,
  disabled,
  onSelect,
  describedBy,
  invalid,
  fileName,
  emptyLabel,
}: {
  id: string;
  accept?: string;
  capture?: string;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
  describedBy?: string;
  invalid?: boolean;
  fileName?: string | null;
  emptyLabel?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-16 cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-dashed border-input bg-card px-3.5 py-3 transition-colors",
        "hover:border-foreground/35 hover:bg-muted/40",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        disabled && "pointer-events-none opacity-50",
        invalid && "border-destructive/50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-medium">
          {fileName ?? emptyLabel ?? "Choose a photo"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {fileName ? "Tap to replace" : "JPG or PNG, from your camera or library"}
        </span>
      </span>
      <span className="shrink-0 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs font-medium">
        Browse
      </span>
      <input
        id={id}
        type="file"
        accept={accept}
        capture={capture as never}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="sr-only"
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Checkbox row used by the inspection checklist. */
export function CheckRow({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border-b border-border/60 py-2.5 last:border-b-0",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-foreground"
      />
      <span className="text-sm leading-snug">{children}</span>
    </label>
  );
}
