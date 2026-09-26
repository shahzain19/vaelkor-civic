"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const PRODUCT_LINKS = [
  { href: "/ledger", label: "Ledger" },
  { href: "/map", label: "Map" },
  { href: "/hackathon", label: "Hackathon" },
];

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "border-t border-border bg-background",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[84rem] px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* Brand column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[0.8125rem] leading-none font-semibold tracking-[0.13em] uppercase">
                Vaelkor
                <span className="ml-1.5 font-normal text-muted-foreground">
                  Civic
                </span>
              </span>
            </div>
            <p className="max-w-sm text-[0.875rem] leading-relaxed text-muted-foreground text-pretty">
              Karachi&apos;s civic infrastructure problems, fixed by the people
              who live with them. Report, confirm, fund, and inspect — all on a
              public ledger.
            </p>
            <p className="text-[0.75rem] text-muted-foreground">
              Karachi, Pakistan
            </p>
          </div>

          {/* Links columns */}
          <div className="grid grid-cols-2 gap-6 sm:gap-8 lg:justify-end">
            <div>
              <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                Platform
              </h3>
              <ul className="space-y-2">
                {PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-[0.6875rem] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                Legal
              </h3>
              <ul className="space-y-2">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.75rem] text-muted-foreground">
            &copy; {new Date().getFullYear()} Vaelkor Civic. All rights reserved.
          </p>
          <p className="text-[0.75rem] text-muted-foreground">
            Built for citizens, by citizens.
          </p>
        </div>
      </div>
    </footer>
  );
}
