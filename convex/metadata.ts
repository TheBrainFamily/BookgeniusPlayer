import { v } from "convex/values";
import { adminMutation, internalMutation, publicQuery } from "./functions";

// =============================================================================
// Queries
// =============================================================================

export const getBookMetadata = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    return await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", bookPath))
      .first();
  },
});

export const listCharacterMetadata = publicQuery({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    return await ctx.db
      .query("characterMetadata")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();
  },
});

export const getCharacterMetadata = publicQuery({
  args: { characterPath: v.string() },
  handler: async (ctx, { characterPath }) => {
    return await ctx.db
      .query("characterMetadata")
      .withIndex("by_path", (q) => q.eq("characterPath", characterPath))
      .first();
  },
});

export const getChapterMetadata = publicQuery({
  args: { folderPath: v.string(), basename: v.string() },
  handler: async (ctx, { folderPath, basename }) => {
    return await ctx.db
      .query("chapterMetadata")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", folderPath).eq("basename", basename),
      )
      .first();
  },
});

export const listChapterMetadata = publicQuery({
  args: { folderPath: v.string() },
  handler: async (ctx, { folderPath }) => {
    return await ctx.db
      .query("chapterMetadata")
      .withIndex("by_folder", (q) => q.eq("folderPath", folderPath))
      .collect();
  },
});

// =============================================================================
// Mutations
// =============================================================================

export const updateBookMetadata = adminMutation({
  args: {
    bookPath: v.string(),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    language: v.optional(v.string()),
    form: v.optional(v.string()),
    visualStyle: v.optional(v.string()),
    backgroundStyle: v.optional(v.string()),
    periodStyle: v.optional(v.string()),
    avatarStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slug = args.bookPath.split("/").pop() || args.bookPath;

    const existing = await ctx.db
      .query("books")
      .withIndex("by_path", (q) => q.eq("path", args.bookPath))
      .first();

    const fields = {
      title: args.title ?? existing?.title,
      author: args.author ?? existing?.author,
      language: args.language ?? existing?.language,
      form: args.form ?? existing?.form,
      visualStyle: args.visualStyle ?? existing?.visualStyle,
      backgroundStyle: args.backgroundStyle ?? existing?.backgroundStyle,
      periodStyle: args.periodStyle ?? existing?.periodStyle,
      avatarStyle: args.avatarStyle ?? existing?.avatarStyle,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { bookId: existing._id };
    }

    const bookId = await ctx.db.insert("books", {
      path: args.bookPath,
      slug,
      ownerId: ctx.principalId,
      title: fields.title,
      author: fields.author,
      language: fields.language,
      form: fields.form,
      visualStyle: fields.visualStyle,
      backgroundStyle: fields.backgroundStyle,
      periodStyle: fields.periodStyle,
      avatarStyle: fields.avatarStyle,
      createdAt: now,
      updatedAt: now,
    });

    return { bookId };
  },
});

export const updateCharacterMetadata = adminMutation({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    displayName: v.optional(v.string()),
    summary: v.optional(v.string()),
    aiPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { bookPath, characterSlug, displayName, summary, aiPrompt }) => {
    const characterPath = `${bookPath}/characters/${characterSlug}`;
    const now = Date.now();

    const existing = await ctx.db
      .query("characterMetadata")
      .withIndex("by_book_slug", (q) => q.eq("bookPath", bookPath).eq("slug", characterSlug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: displayName ?? existing.displayName,
        summary: summary ?? existing.summary,
        aiPrompt: aiPrompt ?? existing.aiPrompt,
        updatedAt: now,
      });
      return { characterId: existing._id };
    }

    const characterId = await ctx.db.insert("characterMetadata", {
      bookPath,
      characterPath,
      slug: characterSlug,
      displayName: displayName ?? characterSlug,
      summary: summary ?? "",
      aiPrompt,
      createdAt: now,
      updatedAt: now,
    });

    return { characterId };
  },
});

export const updateChapterMetadata = adminMutation({
  args: {
    bookPath: v.string(),
    folderPath: v.string(),
    basename: v.string(),
    chapterNumber: v.optional(v.number()),
    title: v.optional(v.string()),
    paragraphCount: v.optional(v.number()),
    sourceFormat: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("chapterMetadata")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", args.folderPath).eq("basename", args.basename),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        chapterNumber: args.chapterNumber ?? existing.chapterNumber,
        title: args.title ?? existing.title,
        paragraphCount: args.paragraphCount ?? existing.paragraphCount,
        sourceFormat: args.sourceFormat ?? existing.sourceFormat,
        updatedAt: now,
      });
      return { chapterId: existing._id };
    }

    if (args.chapterNumber === undefined) {
      throw new Error("chapterNumber is required to create chapter metadata");
    }

    const chapterId = await ctx.db.insert("chapterMetadata", {
      bookPath: args.bookPath,
      folderPath: args.folderPath,
      basename: args.basename,
      chapterNumber: args.chapterNumber,
      title: args.title,
      paragraphCount: args.paragraphCount,
      sourceFormat: args.sourceFormat,
      createdAt: now,
      updatedAt: now,
    });

    return { chapterId };
  },
});

export const upsertCharacterMetadataInternal = internalMutation({
  args: {
    bookPath: v.string(),
    characterSlug: v.string(),
    displayName: v.optional(v.string()),
    summary: v.optional(v.string()),
    aiPrompt: v.optional(v.string()),
    avatarGenerationState: v.optional(
      v.union(v.literal("generating"), v.literal("ready"), v.literal("error"), v.literal("none")),
    ),
    avatarProposalUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const characterPath = `${args.bookPath}/characters/${args.characterSlug}`;

    const existing = await ctx.db
      .query("characterMetadata")
      .withIndex("by_book_slug", (q) =>
        q.eq("bookPath", args.bookPath).eq("slug", args.characterSlug),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName ?? existing.displayName,
        summary: args.summary ?? existing.summary,
        aiPrompt: args.aiPrompt ?? existing.aiPrompt,
        avatarGenerationState: args.avatarGenerationState ?? existing.avatarGenerationState,
        avatarProposalUrls: args.avatarProposalUrls ?? existing.avatarProposalUrls,
        updatedAt: now,
      });
      return { characterId: existing._id };
    }

    const characterId = await ctx.db.insert("characterMetadata", {
      bookPath: args.bookPath,
      characterPath,
      slug: args.characterSlug,
      displayName: args.displayName ?? args.characterSlug,
      summary: args.summary ?? "",
      aiPrompt: args.aiPrompt,
      avatarGenerationState: args.avatarGenerationState,
      avatarProposalUrls: args.avatarProposalUrls,
      createdAt: now,
      updatedAt: now,
    });

    return { characterId };
  },
});

export const upsertChapterMetadataInternal = internalMutation({
  args: {
    bookPath: v.string(),
    folderPath: v.string(),
    basename: v.string(),
    chapterNumber: v.optional(v.number()),
    title: v.optional(v.string()),
    paragraphCount: v.optional(v.number()),
    sourceFormat: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("chapterMetadata")
      .withIndex("by_folder_basename", (q) =>
        q.eq("folderPath", args.folderPath).eq("basename", args.basename),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        chapterNumber: args.chapterNumber ?? existing.chapterNumber,
        title: args.title ?? existing.title,
        paragraphCount: args.paragraphCount ?? existing.paragraphCount,
        sourceFormat: args.sourceFormat ?? existing.sourceFormat,
        updatedAt: now,
      });
      return { chapterId: existing._id };
    }

    if (args.chapterNumber === undefined) {
      throw new Error("chapterNumber is required to create chapter metadata");
    }

    const chapterId = await ctx.db.insert("chapterMetadata", {
      bookPath: args.bookPath,
      folderPath: args.folderPath,
      basename: args.basename,
      chapterNumber: args.chapterNumber,
      title: args.title,
      paragraphCount: args.paragraphCount,
      sourceFormat: args.sourceFormat,
      createdAt: now,
      updatedAt: now,
    });

    return { chapterId };
  },
});
