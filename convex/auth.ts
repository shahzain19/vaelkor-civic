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
import type { Role } from "./lifecycle";

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
  if (user.role !== role) {
    throw err.forbidden(action);
  }
  return user;
}

/**
 * Ops-only gate for destructive mutations such as `admin.clearAll`.
 *
 * Allowlist comes from the `ADMIN_CLERK_IDS` Convex env var (comma separated
 * Clerk user ids). Deny-by-default: if the variable is unset or empty, nobody
 * is an admin. Set it with:
 *
 *   npx convex env set ADMIN_CLERK_IDS user_2abc...,user_2def...
 *
 * These mutations are reachable by anyone who can read the public
 * NEXT_PUBLIC_CONVEX_URL, so they must never rely on UI visibility alone.
 */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await requireIdentity(ctx);
  const raw = process.env.ADMIN_CLERK_IDS;
  const allowed = (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (allowed.length === 0) {
    throw err.forbidden("Admin access is not configured");
  }
  if (!allowed.includes(identity.subject)) {
    throw err.forbidden();
  }

  return await userByClerkId(ctx, identity.subject);
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
    role: user.role,
    createdAt: user.createdAt,
  };
}

export type { Id };
