"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * Unread indicator in the header.
 *
 * The count is a separate query from the inbox list so the badge does not
 * depend on how many messages happen to be loaded, and so the header never
 * re-renders the whole list to update a number.
 *
 * The bell deliberately does *not* mark anything read. Opening the inbox is not
 * the same as reading it, and a badge that clears on click cannot answer "what
 * did I miss?" — the inbox page owns that, per item or in bulk.
 *
 * Shown only to a signed-in user who has finished onboarding: a bell on the
 * header of someone with no role yet would advertise an inbox that always
 * throws, because every read in `notifications.ts` is behind `requireUser`.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  const ready = Boolean(isAuthenticated && me?.role);
  const count = useQuery(api.notifications.unreadCount, ready ? {} : "skip");

  if (!ready) return null;

  const unread = count ?? 0;
  const onInbox = pathname === "/notifications";

  return (
    <Link
      href="/notifications"
      aria-current={onInbox ? "page" : undefined}
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        onInbox && "bg-foreground/6 text-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>

      {unread > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-status-broken px-1 text-[0.625rem] leading-4 font-semibold text-white tabular-nums"
          // The count is already in the link's accessible name, so this badge is
          // decoration rather than something to be read out twice.
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
