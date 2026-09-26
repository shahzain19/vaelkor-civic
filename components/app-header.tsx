"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

/**
 * Navigation is derived from the user's role, not from the feature list.
 *
 * A citizen has no use for "Inspect", and an inspector has no use for
 * "Report an issue" — showing them would be exposing features rather than
 * serving the workflow. Signed-out visitors only see the public ledger.
 */
function useNav() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  const ledger = { href: "/ledger", label: "Ledger" };
  // Public, like the ledger — the map is the same cases seen spatially.
  const map = { href: "/map", label: "Map" };
  const home = { href: "/", label: "Overview" };
  const about = { href: "/about", label: "About" };
  const hackathon = { href: "/hackathon", label: "Hackathon" };

  if (!isAuthenticated)
    return { items: [home, ledger, map, about, hackathon], me: null, needsRole: false };

  switch (me?.role) {
    case "contractor":
      return {
        items: [home, ledger, map, { href: "/contractor", label: "Work" }, hackathon],
        me,
        needsRole: false,
      };
    // An administrator records the inspection decision and runs case oversight,
    // so both destinations are theirs. They still cannot file a case, so the
    // Report link stays withheld — without an explicit case this would fall
    // through to `default` below and be handed a link the report page rejects.
    case "admin":
      return {
        items: [
          home,
          ledger,
          map,
          { href: "/inspect", label: "Inspections" },
          { href: "/admin", label: "Oversight" },
          hackathon,
        ],
        me,
        needsRole: false,
      };
    default:
      return {
        items: [home, ledger, map, { href: "/report", label: "Report" }, hackathon],
        me,
        needsRole: !me?.role,
      };
  }
}

export function AppHeader() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const ensure = useMutation(api.users.ensure);
  const { items, needsRole } = useNav();

  useEffect(() => {
    if (isAuthenticated) {
      void ensure({});
    }
  }, [isAuthenticated, ensure]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      {/*
        Two rows on small screens. The wordmark, two nav items and two auth
        buttons cannot share 375px — the nav would collapse to zero width and
        the primary action would be pushed off-screen. Nav gets a full-width
        row of its own below `sm`, and the rows merge into one on desktop.
      */}
      <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:h-14 sm:flex-nowrap sm:gap-x-6 sm:py-0 sm:px-6">
        <Link
          href="/"
          className="order-1 flex shrink-0 items-center gap-2 rounded-[var(--radius)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Image
            src="/vaelkor-civic.png"
            alt=""
            width={512}
            height={512}
            priority
            // Without an explicit `sizes`, next/image assumes the image may be
            // rendered full-bleed and ships a 640w variant for a 28px mark.
            sizes="28px"
            className="size-7 shrink-0 rounded-[3px] object-cover"
          />
          <span className="text-[0.8125rem] leading-none font-semibold tracking-[0.13em] uppercase">
            Vaelkor
            <span className="ml-1.5 font-normal text-muted-foreground">
              Civic
            </span>
          </span>
        </Link>

        <nav
          aria-label="Main"
          className="order-3 -mx-1 w-[calc(100%+2rem)] min-w-0 overflow-x-auto px-4 sm:order-2 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0"
        >
          <ul className="flex items-center gap-1">
            {items.map((item) => {
              // The ledger is also the site root's child, so match it longest-first.
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-block rounded-[var(--radius)] px-2.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
                      active
                        ? "bg-foreground/6 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {needsRole && (
              <li>
                <Link
                  href="/onboarding"
                  className="inline-block rounded-[var(--radius)] px-2.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-status-confirmed transition-colors hover:underline"
                >
                  Choose role →
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
          {isLoading ? (
            <div className="h-7 w-16 animate-pulse rounded-[var(--radius)] bg-muted" />
          ) : (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button size="sm">Get started</Button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <NotificationBell />
                {me?.role && (
                  <span className="hidden text-[0.6875rem] leading-none font-semibold tracking-[0.09em] text-muted-foreground uppercase lg:inline">
                    {me.role}
                  </span>
                )}
                <UserButton />
              </Show>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
