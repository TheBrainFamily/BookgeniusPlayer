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
import { isAdmin, isValidAdminKey, principalId, requireIdentity } from "./authz";
import { internal } from "./_generated/api";

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
  adminKey?: string,
): Promise<BookAccessResult> {
  // Admin key bypass for scripts/CLI
  if (isValidAdminKey(adminKey)) {
    return { principalId: "admin-key", role: "admin" };
  }

  const identity = await requireIdentity(ctx, adminKey);
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
  adminKey?: string,
): Promise<BookAccessResult> {
  // Admin key bypass for scripts/CLI
  if (isValidAdminKey(adminKey)) {
    return { principalId: "admin-key", role: "admin" };
  }

  const identity = await requireIdentity(ctx, adminKey);
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

/**
 * Require book write access from an action context.
 * Calls internal query to check permissions since actions don't have ctx.db.
 * Note: The query is in authzQueries.ts to avoid circular dependencies.
 */
export async function requireBookWriteAccessFromAction(
  ctx: ActionCtx,
  bookPath: string,
  adminKey?: string,
): Promise<BookAccessResult> {
  // Admin key bypass for scripts/CLI
  if (isValidAdminKey(adminKey)) {
    return { principalId: "admin-key", role: "admin" };
  }

  const identity = await requireIdentity(ctx, adminKey);
  const principal = principalId(identity);
  const adminFlag = isAdmin(identity);

  // Use internal query from separate file to avoid circular dependency
  const { role } = await ctx.runQuery(internal.authzQueries.checkBookWriteAccess, {
    bookPath,
    principal,
    isAdmin: adminFlag,
  });

  return { principalId: principal, role };
}
