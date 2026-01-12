import { type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Require authentication for a mutation.
 * Uses Clerk JWT validated by Convex auth.config.ts
 * @returns The authenticated user's ID (or "anonymous" if auth disabled)
 */
export async function requireAuth(ctx: MutationCtx | QueryCtx) {
  const authRequired = process.env.AUTH_REQUIRED === "true";

  if (!authRequired) {
    return "anonymous";
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: You must be logged in to perform this action");
  }
  // Return Clerk's subject (user ID) from the JWT
  return identity.subject;
}
