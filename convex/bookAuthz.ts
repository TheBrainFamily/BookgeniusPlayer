/**
 * Book authorization - checks ownership and membership for book access.
 *
 * Flow:
 * 1. Admin? → allow (bypass all checks)
 * 2. Owner in `books` table? → allow
 * 3. Editor/Owner in `bookMembers` table? → allow
 * 4. Otherwise → throw Forbidden
 */
import type { MutationCtx, QueryCtx, ActionCtx } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { isAdmin, principalId, requireIdentity } from "./authz";

type MutationOrQueryCtx = MutationCtx | QueryCtx;

export type BookRole = "admin" | "owner" | "editor" | "viewer";

export interface BookAccessResult {
  principalId: string;
  role: BookRole;
}

/**
 * Require write access to a book.
 * Admins can edit any book. Owners and editors can edit their books.
 *
 * @throws Error if not authenticated or no write access
 */
export async function requireBookWriteAccess(
  ctx: MutationOrQueryCtx,
  bookPath: string,
): Promise<BookAccessResult> {
  const identity = await requireIdentity(ctx);
  const principal = principalId(identity);

  // Admins can edit anything
  if (isAdmin(identity)) {
    return { principalId: principal, role: "admin" };
  }

  // Check if book exists and user is owner
  const book = await ctx.db
    .query("books")
    .withIndex("by_path", (q) => q.eq("path", bookPath))
    .unique();

  if (book?.ownerId === principal) {
    return { principalId: principal, role: "owner" };
  }

  // Check bookMembers for collaborator access
  const membership = await ctx.db
    .query("bookMembers")
    .withIndex("by_book_principal", (q) => q.eq("bookPath", bookPath).eq("principal", principal))
    .unique();

  if (membership && (membership.role === "owner" || membership.role === "editor")) {
    return { principalId: principal, role: membership.role };
  }

  // No access - book doesn't exist or user doesn't have permission
  throw new Error("Forbidden: no write access to this book");
}

/**
 * Check if user has read access to a book.
 * For now, all authenticated users can read any book.
 * Viewers in bookMembers are also allowed.
 */
export async function requireBookReadAccess(
  ctx: MutationOrQueryCtx,
  bookPath: string,
): Promise<BookAccessResult> {
  const identity = await requireIdentity(ctx);
  const principal = principalId(identity);

  // Admins can read anything
  if (isAdmin(identity)) {
    return { principalId: principal, role: "admin" };
  }

  // Check if book exists and user is owner
  const book = await ctx.db
    .query("books")
    .withIndex("by_path", (q) => q.eq("path", bookPath))
    .unique();

  if (book?.ownerId === principal) {
    return { principalId: principal, role: "owner" };
  }

  // Check bookMembers for any role (including viewer)
  const membership = await ctx.db
    .query("bookMembers")
    .withIndex("by_book_principal", (q) => q.eq("bookPath", bookPath).eq("principal", principal))
    .unique();

  if (membership) {
    return { principalId: principal, role: membership.role };
  }

  // For now, allow any authenticated user to read (public books)
  // Can be changed later to require explicit membership
  return { principalId: principal, role: "viewer" };
}

// =============================================================================
// Internal Query for Actions
// =============================================================================

/**
 * Internal query to check book write access.
 * Used by bookAction wrapper since actions can't access ctx.db directly.
 * Returns role if access granted, or throws if denied.
 */
export const checkBookWriteAccessInternal = internalQuery({
  args: { bookPath: v.string(), principal: v.string(), isAdmin: v.boolean() },
  returns: v.object({ role: v.union(v.literal("admin"), v.literal("owner"), v.literal("editor")) }),
  handler: async (ctx, { bookPath, principal, isAdmin: adminFlag }) => {
    // Admins can edit anything
    if (adminFlag) {
      return { role: "admin" as const };
    }

    // Check if book exists and user is owner
    const book = await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", bookPath))
      .unique();

    if (book?.ownerId === principal) {
      return { role: "owner" as const };
    }

    // Check bookMembers for collaborator access
    const membership = await ctx.db
      .query("bookMembers")
      .withIndex("by_book_principal", (q) => q.eq("bookPath", bookPath).eq("principal", principal))
      .unique();

    if (membership && (membership.role === "owner" || membership.role === "editor")) {
      return { role: membership.role };
    }

    // No access
    throw new Error("Forbidden: no write access to this book");
  },
});

/**
 * Require book write access from an action context.
 * Calls internal query to check permissions since actions don't have ctx.db.
 */
export async function requireBookWriteAccessFromAction(
  ctx: ActionCtx,
  bookPath: string,
): Promise<BookAccessResult> {
  const identity = await requireIdentity(ctx);
  const principal = principalId(identity);
  const adminFlag = isAdmin(identity);

  // Use internal query to check access
  const { role } = await ctx.runQuery(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkBookWriteAccessInternal as any,
    { bookPath, principal, isAdmin: adminFlag },
  );

  return { principalId: principal, role };
}
