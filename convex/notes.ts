/**
 * Notes - Footnotes and annotations for books
 *
 * Notes are linked to specific chapters and referenced in chapter XML via <note id='X'> tags.
 * The noteId follows the pattern "fnX" where X matches the id attribute in the XML.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// =============================================================================
// Queries
// =============================================================================

/**
 * List all notes for a book.
 * Returns simplified format for player consumption.
 */
export const listByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return notes.map((n) => ({ id: n.noteId, content: n.content }));
  },
});

/**
 * List notes for a specific chapter.
 * Used for per-chapter loading in sliding window pattern.
 */
export const listByChapter = query({
  args: { bookPath: v.string(), chapter: v.number() },
  handler: async (ctx, { bookPath, chapter }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book_chapter", (q) => q.eq("bookPath", bookPath).eq("chapter", chapter))
      .collect();

    return notes.map((n) => ({ id: n.noteId, content: n.content }));
  },
});

/**
 * List notes for a range of chapters.
 * Useful for preloading adjacent chapters.
 */
export const listByChapterRange = query({
  args: { bookPath: v.string(), fromChapter: v.number(), toChapter: v.number() },
  handler: async (ctx, { bookPath, fromChapter, toChapter }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .filter((q) =>
        q.and(q.gte(q.field("chapter"), fromChapter), q.lte(q.field("chapter"), toChapter)),
      )
      .collect();

    return notes.map((n) => ({ id: n.noteId, content: n.content, chapter: n.chapter }));
  },
});

/**
 * Get a single note by ID.
 */
export const getByNoteId = query({
  args: { bookPath: v.string(), noteId: v.string() },
  handler: async (ctx, { bookPath, noteId }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .filter((q) => q.eq(q.field("noteId"), noteId))
      .first();

    if (!notes) return null;

    return { id: notes.noteId, content: notes.content, chapter: notes.chapter };
  },
});

/**
 * Get a single note with full document including _id for editing.
 * Uses the by_book_noteId index for efficient lookup.
 */
export const getFullNoteByNoteId = query({
  args: { bookPath: v.string(), noteId: v.string() },
  handler: async (ctx, { bookPath, noteId }) => {
    const note = await ctx.db
      .query("notes")
      .withIndex("by_book_noteId", (q) => q.eq("bookPath", bookPath).eq("noteId", noteId))
      .first();

    if (!note) return null;

    return {
      _id: note._id,
      noteId: note.noteId,
      content: note.content,
      chapter: note.chapter,
      paragraph: note.paragraph,
    };
  },
});

/**
 * Count notes for a book.
 * Used for dashboard stats.
 */
export const countByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return notes.length;
  },
});

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new note.
 */
export const create = mutation({
  args: {
    bookPath: v.string(),
    noteId: v.string(),
    content: v.string(),
    chapter: v.number(),
    paragraph: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notes", args);
  },
});

/**
 * Update a note's content.
 */
export const update = mutation({
  args: { id: v.id("notes"), content: v.string() },
  handler: async (ctx, { id, content }) => {
    return await ctx.db.patch(id, { content });
  },
});

/**
 * Update a note's chapter assignment.
 */
export const updateChapter = mutation({
  args: { id: v.id("notes"), chapter: v.number(), paragraph: v.optional(v.number()) },
  handler: async (ctx, { id, chapter, paragraph }) => {
    return await ctx.db.patch(id, { chapter, paragraph });
  },
});

/**
 * Delete a note.
 */
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id);
  },
});

/**
 * Bulk create notes (for import).
 */
export const bulkCreate = mutation({
  args: {
    notes: v.array(
      v.object({
        bookPath: v.string(),
        noteId: v.string(),
        content: v.string(),
        chapter: v.number(),
        paragraph: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { notes }) => {
    const ids = [];
    for (const note of notes) {
      const id = await ctx.db.insert("notes", note);
      ids.push(id);
    }
    return ids;
  },
});
