/**
 * Internal queries for authorization checks.
 * Separated from bookAuthz.ts to avoid circular dependencies when actions call these.
 */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Internal query to check book write access.
 * Used by bookAction wrapper since actions can't access ctx.db directly.
 * Returns role if access granted, or throws if denied.
 */
export const checkBookWriteAccess = internalQuery({
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
