/**
 * Authorization utilities - admin checks by email from JWT.
 *
 * No Clerk API calls - email is in the JWT token, validated locally.
 */
import type { MutationCtx, QueryCtx, ActionCtx } from "./_generated/server";

type Ctx = MutationCtx | QueryCtx | ActionCtx;
type Identity = NonNullable<Awaited<ReturnType<Ctx["auth"]["getUserIdentity"]>>>;

/**
 * Admin emails loaded from ADMIN_EMAILS env var.
 * Format: "email1@example.com,email2@example.com"
 */
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Get the authenticated user's identity.
 * Throws if not authenticated.
 */
export async function requireIdentity(ctx: Ctx): Promise<Identity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }
  return identity;
}

/**
 * Check if a user is an admin based on their email.
 * Email is extracted from JWT - no Clerk API call needed.
 */
export function isAdmin(identity: Identity): boolean {
  const email = identity.email?.toLowerCase();
  return !!email && adminEmails.has(email);
}

/**
 * Require the user to be an admin.
 * Throws if not authenticated or not an admin.
 */
export async function requireAdmin(ctx: Ctx): Promise<Identity> {
  const identity = await requireIdentity(ctx);
  if (!isAdmin(identity)) {
    throw new Error("Forbidden: admin required");
  }
  return identity;
}

/**
 * Get the stable user identifier for storage.
 * Uses tokenIdentifier which is stable across Clerk dev/prod instances.
 */
export function principalId(identity: Identity): string {
  return identity.tokenIdentifier;
}
