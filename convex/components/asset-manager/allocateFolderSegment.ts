import type { MutationCtx } from "./_generated/server";

export async function allocateFolderSegment(
  ctx: MutationCtx,
  parentPath: string,
  baseSlug: string,
): Promise<string> {
  let suffix = 0;

  while (true) {
    const segment = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const path = parentPath ? `${parentPath}/${segment}` : segment;

    const existing = await ctx.db
      .query("folders")
      .withIndex("by_path", (q) => q.eq("path", path))
      .first();

    if (!existing) {
      // Free slot, we can take this segment.
      return segment;
    }

    // Different name, same slug → try next suffix.
    suffix++;

    // (Paranoid safety guard)
    if (suffix > 100) {
      throw new Error("Too many slug collisions while creating folder");
    }
  }
}
