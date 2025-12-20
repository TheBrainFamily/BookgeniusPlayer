import { MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Require authentication for a mutation.
 * Throws an error if the user is not logged in (unless AUTH_REQUIRED=false).
 * @returns The authenticated user's ID (or "anonymous" if auth disabled)
 */
export async function requireAuth(ctx: MutationCtx) {
  // Check if auth is required (default: false for easy collaboration)
  const authRequired = process.env.AUTH_REQUIRED === "true";

  if (!authRequired) {
    // Auth disabled - allow anonymous access
    return "anonymous" as any;
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Unauthorized: You must be logged in to perform this action");
  }
  return userId;
}
