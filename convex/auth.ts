/**
 * Authentication and authorisation.
 *
 * Two rules hold everywhere in this codebase:
 *
 *  - Authorisation is decided on the server, from the Convex user row. Nothing
 *    in the UI is treated as a guard, because the deployment is public: anyone
 *    with the Convex URL can call any function.
 *  - A failure throws a typed `AppError`, never a raw `Error`, so the message a
 *    user sees is written for them.
 */

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { err } from "./errors";
import { normalizeRole, type Role } from "./lifecycle";

type Ctx = QueryCtx | MutationCtx;

export async function getIdentityOrNull(ctx: Ctx) {
  return await ctx.auth.getUserIdentity();
}

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw err.unauthenticated();
  return identity;
}

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await userByClerkId(ctx, identity.subject);
}

export async function userByClerkId(
  ctx: Ctx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx);
  const user = await userByClerkId(ctx, identity.subject);
  if (!user) throw err.unauthenticated("Finish setting up your account to continue.");
  if (!user.role) throw err.forbidden("Choose a civic role to continue.");
  return user;
}

/**
 * Requires a specific role.
 *
 * Callers must not leak *which* roles exist into the failure text beyond what
 * the person already knows, so the message names only the action.
 */
export async function requireRole(
  ctx: Ctx,
  role: Role,
  action: string,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  // Normalised, not compared raw: an account still holding a folded role (see
  // `LEGACY_ROLES`) must keep working without waiting to be migrated.
  if (normalizeRole(user.role) !== role) {
    throw err.forbidden(action);
  }
  return user;
}

/**
 * Two distinct privileges, deliberately not unified.
 *
 * `ops` is a deployer's power — it can wipe every table, and it is granted by
 * an env-var allowlist of Clerk subjects that has to be set out of band. `oversight`
 * is a product role held by a person who works there: it can unblock a stuck
 * case and read oversight figures, and nothing else.
 *
 * They are kept apart because the blast radii are different. `admin.clearAll`
 * deletes the `users` table, so a role-based admin would be deleting its own
 * authority, and a municipal staff account has no business being able to. If the
 * two were merged, "who can wipe the demo database before a pitch" and "who runs
 * the escalation queue" would be the same question, answered by the same env
 * var, and neither could be delegated.
 */

/** Clerk subjects on the ops allowlist. Empty means nobody. */
function opsAllowlist(): string[] {
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isOpsSubject(clerkId: string): boolean {
  return opsAllowlist().includes(clerkId);
}

/**
 * Ops-only gate for destructive mutations such as `admin.clearAll`.
 *
 * Allowlist comes from the `ADMIN_CLERK_IDS` Convex env var (comma separated
 * Clerk user ids). Deny-by-default: if the variable is unset or empty, nobody
 * has ops access. Set it with:
 *
 *   npx convex env set ADMIN_CLERK_IDS user_2abc...,user_2def...
 *
 * These mutations are reachable by anyone who can read the public
 * NEXT_PUBLIC_CONVEX_URL, so they must never rely on UI visibility alone.
 */
export async function requireOps(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await requireIdentity(ctx);

  if (opsAllowlist().length === 0) {
    throw err.forbidden("Admin access is not configured");
  }
  if (!isOpsSubject(identity.subject)) {
    throw err.forbidden();
  }

  return await userByClerkId(ctx, identity.subject);
}

/**
 * The gate for granting a privileged role.
 *
 * Split from `requireOps` because the failure means something different: not
 * "you may not wipe the database" but "you may not hand out authority". Kept as
 * its own function so the grant path and the destructive path cannot drift into
 * sharing one message.
 */
export async function assertMayGrantPrivilegedRole(
  ctx: Ctx,
  subject: string,
): Promise<void> {
  if (opsAllowlist().length === 0) {
    throw err.forbidden("Admin access is not configured");
  }
  if (!isOpsSubject(subject)) {
    throw err.forbidden("Only an operator can grant the admin role.");
  }
  void ctx;
}

/**
 * Requires the `admin` role: inspection sign-off and case oversight.
 *
 * An administrator records the inspection decision, reads the escalation queue,
 * and can grant a stuck case more attempts. They still cannot report a case or
 * claim and execute work — those stay with the civic roles, so holding `admin`
 * does not put anyone in a queue they have no business being in, and it does not
 * let the person who arranged the work also do the work.
 */
export async function requireOversight(
  ctx: Ctx,
  action: string,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (normalizeRole(user.role) !== "admin") {
    throw err.forbidden(action);
  }
  return user;
}

/**
 * Public projection of a user.
 *
 * `clerkId` is the auth subject and `email` is personal data; neither belongs in
 * a response that any signed-in user can request for any other user id.
 */
export function publicUser(user: Doc<"users"> | null) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    // Normalised so the client never sees a retired role and never has to know
    // one existed.
    role: normalizeRole(user.role),
    createdAt: user.createdAt,
  };
}

export type { Id };
