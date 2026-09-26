import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { roleValidator } from "./schema";
import {
  getCurrentUser,
  publicUser,
  requireIdentity,
  userByClerkId,
} from "./auth";
import { isSelfSelectableRole } from "../lib/civic";
import { err, toSafeError } from "./errors";
import { enforceRateLimit } from "./rateLimit";

export const me = query({
  args: {},
  handler: async (ctx) => {
    return publicUser(await getCurrentUser(ctx));
  },
});

/**
 * Public profile lookup.
 *
 * Requires a signed-in caller and returns only the public projection. The
 * previous version returned the raw row, which exposed `clerkId` (the auth
 * subject) and `email` for any user id to anyone who could guess it.
 */
export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return publicUser(await ctx.db.get(args.userId));
  },
});

/** Ensure a Convex user row exists for the signed-in Clerk identity. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await requireIdentity(ctx);
      const existing = await userByClerkId(ctx, identity.subject);

      const name = resolveName(identity);

      if (existing) {
        const patch: { name?: string; email?: string } = {};
        if (existing.name !== name) patch.name = name.slice(0, 80);
        if (identity.email && existing.email !== identity.email) {
          patch.email = identity.email.slice(0, 200);
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existing._id, patch);
        }
        return existing._id;
      }

      return await ctx.db.insert("users", {
        clerkId: identity.subject,
        name: name.slice(0, 80),
        email: identity.email?.slice(0, 200),
        createdAt: Date.now(),
      });
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

/**
 * Sets your own civic role.
 *
 * Rate limited because role cycling would otherwise let one account enumerate
 * every role-gated surface, including the ones it should not be in.
 *
 * `admin` is refused outright, and this is the enforcement point rather than a
 * UI convention. Onboarding deliberately lets anyone switch between the three
 * civic roles at will, so the naive version of "add admin to the role union"
 * would hand `admin` to every signed-in account the first time it called
 * `setRole({ role: "admin" })` — the onboarding page would look exactly the same
 * while the backend became escalable.
 *
 * Note this mutation can only change the *caller's own* role, which is why
 * handing the admin role to somebody else is a separate, ops-gated function
 * (`admin.grantRole`) rather than a flag on this one. The refusal is
 * deliberately uniform and mentions no configuration state: telling a
 * signed-in user whether the ops allowlist happens to be set would leak how the
 * deployment is administered to anyone who calls the function.
 */
export const setRole = mutation({
  args: { role: roleValidator },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    await enforceRateLimit(ctx, "roleChange", identity.subject);

    try {
      if (!isSelfSelectableRole(args.role)) {
        throw err.forbidden("Only an operator can grant the admin role.");
      }

      const existing = await userByClerkId(ctx, identity.subject);
      const name = resolveName(identity).slice(0, 80);

      if (!existing) {
        return await ctx.db.insert("users", {
          clerkId: identity.subject,
          name,
          email: identity.email?.slice(0, 200),
          role: args.role,
          createdAt: Date.now(),
        });
      }

      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    } catch (e) {
      throw toSafeError(e);
    }
  },
});

function resolveName(identity: {
  name?: string;
  email?: string;
}): string {
  return (
    identity.name?.trim() ||
    identity.email?.split("@")[0] ||
    "Citizen"
  );
}

export { err };
