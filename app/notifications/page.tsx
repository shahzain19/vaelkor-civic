"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, BellOff, Check } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader, PageShell, Section } from "@/components/shell";
import {
  ActionButton,
  Banner,
  EmptyState,
  LiveRegion,
  Skeleton,
} from "@/components/feedback";
import { buttonVariants } from "@/components/ui/button";
import { CaseRef } from "@/components/status";
import { NOTIFICATION_TONE, TONE_DOT } from "@/lib/civic";
import { cn } from "@/lib/utils";

/**
 * The recipient's own inbox.
 *
 * Every row is a case the reader is already party to — a case they reported, a
 * case they are executing, or a case waiting on the inspection queue they belong
 * to. There is no notification from a stranger, so this page needs no follower
 * graph, no visibility rules, and no way to surface someone else's case.
 */
export default function NotificationsPage() {
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useQuery(api.notifications.list, { limit: 50 });
  const unread = useQuery(api.notifications.unreadCount, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  if (rows === undefined) {
    return (
      <PageShell>
        <PageHeader eyebrow="Inbox" title="Notifications" />
        <div
          className="space-y-2"
          role="status"
          aria-label="Loading notifications"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </PageShell>
    );
  }

  const unreadCount = unread ?? 0;

  async function markEverythingRead() {
    setBusy(true);
    try {
      const n = await markAllRead({});
      setNotice({
        tone: "success",
        text:
          n === 1
            ? "1 notification marked read."
            : `${n} notifications marked read.`,
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Could not mark them read. Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inbox"
        title="What moved, and who moved it."
        description="Every entry is a case you are already part of — one you reported, one you are executing, or one waiting on the inspection queue you belong to. You do not have to go looking for it."
        actions={
          unreadCount > 0 ? (
            <ActionButton
              variant="outline"
              onClick={markEverythingRead}
              pending={busy}
              pendingLabel="Marking…"
            >
              <Check />
              Mark all read
            </ActionButton>
          ) : null
        }
      />

      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <Section label={`${rows.length} most recent`}>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing waiting on you"
            body="When a case you are part of moves — a work order opens, a contractor claims it, an inspector rules on it — it appears here."
            icon={BellOff}
            action={
              <Link
                href="/ledger"
                className={buttonVariants({ variant: "outline" })}
              >
                Browse the ledger
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const tone = NOTIFICATION_TONE[row.kind];
              const isUnread = row.readAt === undefined;
              const when = new Date(row.createdAt);
              return (
                <li key={row._id}>
                  <Link
                    href={`/issues/${row.issueId}`}
                    onClick={() => {
                      // Read on open, not on render: the reader picked this one.
                      if (!isUnread) return;
                      void markRead({ notificationId: row._id }).catch(() => {});
                    }}
                    className={cn(
                      "group flex gap-3 rounded-[var(--radius)] border p-3.5 transition-colors hover:bg-muted/50",
                      isUnread ? "bg-card" : "bg-background",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        TONE_DOT[tone],
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "text-[0.9375rem] leading-snug",
                            isUnread
                              ? "font-semibold"
                              : "font-medium text-foreground/80",
                          )}
                        >
                          {row.title}
                        </span>
                        {isUnread && (
                          <span className="text-[0.6875rem] font-semibold tracking-[0.07em] text-status-confirmed uppercase">
                            New
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted-foreground">
                        {row.body}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-[0.75rem] text-muted-foreground">
                        <CaseRef value={row.caseNumber} />
                        <span aria-hidden>·</span>
                        <time dateTime={when.toISOString()}>
                          {when.toLocaleString()}
                        </time>
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 self-start text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <LiveRegion
        message={notice?.text}
        assertive={notice?.tone === "error"}
      />
    </PageShell>
  );
}
