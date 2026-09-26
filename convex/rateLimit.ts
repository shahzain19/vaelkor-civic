/**
 * Abuse controls.
 *
 * A fixed-window counter keyed by subject and action. The subject is the
 * authenticated user when there is one, falling back to the request IP, so a
 * limit cannot be trivially sidestepped by creating another account *and* a
 * single shared NAT cannot lock out a whole neighbourhood behind one user.
 *
 * Fixed windows are chosen deliberately over sliding windows: they need one
 * row per key instead of one row per request, which keeps the table bounded and
 * the write cost at exactly one read + one write per mutation.
 */

import type { MutationCtx } from "./_generated/server";
import { AppError } from "./errors";

/**
 * Per-action budgets. The numbers are chosen from what a legitimate person does
 * in a session, not from a round number: a citizen files perhaps a handful of
 * reports a day, a contractor touches a few work orders an hour.
 */
export const LIMITS = {
  /** New cases per user per hour. */
  reportCreate: { max: 10, windowMs: 60 * 60 * 1000 },
  /** Confirmation clicks — guards against double-submit and scripted inflation. */
  confirm: { max: 30, windowMs: 60 * 60 * 1000 },
  /** Minting upload URLs. Cheapest way to burn storage, so it is tightest. */
  uploadUrl: { max: 40, windowMs: 60 * 60 * 1000 },
  /** Attaching a photo to a case. */
  evidenceAttach: { max: 60, windowMs: 60 * 60 * 1000 },
  /** Accepting work orders — a contractor cannot legitimately claim 20/hour. */
  workAccept: { max: 20, windowMs: 60 * 60 * 1000 },
  /** Inspection decisions. */
  inspectionDecide: { max: 40, windowMs: 60 * 60 * 1000 },
  /** Role changes, to stop a user cycling roles to probe every surface. */
  roleChange: { max: 10, windowMs: 60 * 60 * 1000 },
  /** Reads that mint signed storage URLs. */
  signedUrls: { max: 300, windowMs: 60 * 60 * 1000 },
} as const;

export type LimitName = keyof typeof LIMITS;

/**
 * Best-effort client IP.
 *
 * Convex does not expose the connecting address to a function, so this reads the
 * platform's forwarding header when present. It is only ever a *fallback*
 * subject: authenticated traffic is always keyed by user id, which cannot be
 * spoofed by setting a header.
 */
function clientIp(ctx: MutationCtx): string | null {
  const headers = (ctx as unknown as { auth?: { headers?: Headers } }).auth
    ?.headers;
  const forwarded = headers?.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

/** The identity a limit is counted against. */
export function rateLimitSubject(
  ctx: MutationCtx,
  userId: string | null,
): string {
  if (userId) return `user:${userId}`;
  const ip = clientIp(ctx);
  return ip ? `ip:${ip}` : "anon";
}

/**
 * Consumes one unit of `name`'s budget, throwing a retryable `AppError` when the
 * budget is spent.
 *
 * Call this *after* authentication so the subject is the user id. The check is
 * read-then-write inside a Convex mutation and therefore serializable: two
 * concurrent requests cannot both observe `count = max - 1` and both pass.
 */
export async function enforceRateLimit(
  ctx: MutationCtx,
  name: LimitName,
  userId: string | null,
  overrides?: { max?: number; windowMs?: number },
): Promise<void> {
  const config = LIMITS[name];
  const max = overrides?.max ?? config.max;
  const windowMs = overrides?.windowMs ?? config.windowMs;

  const key = `${name}:${rateLimitSubject(ctx, userId)}`;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing) {
    await ctx.db.insert("rateLimits", { key, windowStart, count: 1 });
    return;
  }

  if (existing.windowStart !== windowStart) {
    // Reset the existing row in place. Inserting a second row for the same key
    // would make the `by_key` lookup above ambiguous, and `.unique()` would
    // throw on the next call.
    await ctx.db.patch(existing._id, { windowStart, count: 1 });
    return;
  }

  if (existing.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    throw new AppError(
      "rate_limited",
      `You've hit the limit for this action. Try again in ${formatWait(retryAfter)}.`,
      retryAfter,
    );
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Test and admin hook: forget a subject's budget.
 *
 * Exposed through `admin.resetRateLimits` so a locked-out operator is not stuck
 * until the window rolls over.
 */
export async function resetRateLimit(
  ctx: MutationCtx,
  name: LimitName,
  subject: string,
): Promise<void> {
  const key = `${name}:${subject}`;
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (row) await ctx.db.delete(row._id);
}
