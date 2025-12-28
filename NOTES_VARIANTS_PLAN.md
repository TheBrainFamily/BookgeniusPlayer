# Notes & Variants Implementation Plan (Native Convex Tables)

## Architecture Decision: Native Tables

Native Convex tables are the right choice here because:

1. **Granular queries** - Fetch notes/variants per chapter, not entire book
2. **Efficient updates** - Add/edit single note without touching others
3. **Real-time reactivity** - Convex subscriptions work naturally
4. **Indexing** - Query by bookPath + chapter efficiently
5. **No JSON parsing** - Data is already structured

---

## Data Model

### Schema Addition (`convex/schema.ts`)

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  comicSubmissions: defineTable({ /* existing */ }),

  // Notes (footnotes/annotations)
  notes: defineTable({
    bookPath: v.string(),         // e.g., "books/Lalka"
    noteId: v.string(),           // e.g., "fn1", "fn2"
    content: v.string(),          // HTML content
    chapter: v.number(),          // Required for per-chapter queries
    paragraph: v.optional(v.number()),
  })
    .index("by_book", ["bookPath"])
    .index("by_book_chapter", ["bookPath", "chapter"]),

  // Variants (sentence simplifications)
  variants: defineTable({
    bookPath: v.string(),         // e.g., "books/Romeo-And-Juliet"
    variantId: v.string(),        // e.g., "ch1-p9-s1"
    chapter: v.number(),          // Required - extracted from ID
    simplifications: v.array(
      v.object({
        score: v.number(),        // 0-100, lower = simpler
        sentences: v.array(v.string()),
      })
    ),
  })
    .index("by_book", ["bookPath"])
    .index("by_book_chapter", ["bookPath", "chapter"]),
});
```

### Types (shared)

```ts
// Note - footnote/annotation
export type Note = {
  id: string;      // noteId from table
  content: string; // HTML content
};

// Variant - sentence simplification (simplified version, no analysis)
export type Variant = {
  id: string;      // variantId from table
  simplifications: {
    score: number;
    sentences: string[];
  }[];
};
```

---

## Import Strategy for Notes

### The Challenge

Notes are stored in `getNotes.ts` with IDs like `fn1`, `fn2`, etc.
The chapter that uses a note is determined by `<note id='1'>` tags in chapter XML.

**Mapping:**
- `fn1` in getNotes.ts ↔ `<note id='1'>` in chapter XML
- `fn37` in getNotes.ts ↔ `<note id='37'>` in chapter XML

### Import Algorithm

```ts
async function importNotesForBook(bookPath: string, bookSlug: string) {
  // 1. Load all notes from legacy file
  const { getNotes } = await import(`../books/${bookSlug}/getNotes`);
  const allNotes = getNotes(); // Array of { id: "fn1", content: "..." }

  // 2. Build lookup map: noteId -> Note
  const noteMap = new Map<string, { id: string; content: string }>();
  for (const note of allNotes) {
    noteMap.set(note.id, note);
  }

  // 3. Scan each chapter XML for <note id='X'> tags
  const chaptersPath = `${bookPath}/chapters`;
  const chapterFiles = await listChapterFiles(chaptersPath);

  for (const chapterFile of chapterFiles) {
    const chapterNumber = extractChapterNumber(chapterFile.basename);
    const xml = await fetchChapterContent(chapterFile.versionId);

    // Find all <note id='X'> in this chapter
    const noteIdMatches = xml.matchAll(/<note\s+id=['"](\d+)['"]/g);

    for (const match of noteIdMatches) {
      const noteNum = match[1];         // "1", "37", etc.
      const noteId = `fn${noteNum}`;    // "fn1", "fn37", etc.

      const note = noteMap.get(noteId);
      if (note) {
        await client.mutation(api.notes.create, {
          bookPath,
          noteId: note.id,
          content: note.content,
          chapter: chapterNumber,
        });
      }
    }
  }
}
```

### For Variants

Variants already encode chapter in their ID: `ch1-p9-s1` → chapter 1

```ts
function extractChapterFromVariantId(variantId: string): number {
  const match = variantId.match(/^ch(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
```

---

## Subscription Strategy

### Current: Subscribe per book (simple, works for now)
```ts
const notes = useQuery(api.notes.listByBook, { bookPath });
```

### Future: Subscribe per chapter window

For efficient loading, subscribe to a sliding window of chapters:

```ts
// Option A: Single query with chapter range
const chapterWindow = useQuery(api.notes.listByChapterRange, {
  bookPath,
  fromChapter: currentChapter - 1,
  toChapter: currentChapter + 1,
});

// Option B: Three separate queries (easier to manage cache)
const prevChapter = useQuery(api.notes.listByChapter, { bookPath, chapter: currentChapter - 1 });
const currChapter = useQuery(api.notes.listByChapter, { bookPath, chapter: currentChapter });
const nextChapter = useQuery(api.notes.listByChapter, { bookPath, chapter: currentChapter + 1 });
```

**Option B preferred** because:
- When user moves to next chapter, the "current" data is already loaded (was "next")
- Only need to subscribe to new "next" chapter
- Can keep previous chapter data in memory for back navigation

---

## Implementation Plan

### Phase 1: Schema & Basic Queries

**1.1 Update `convex/schema.ts`**

Add `notes` and `variants` tables with indexes.

**1.2 Create `convex/notes.ts`**

```ts
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// List all notes for a book
export const listByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return notes.map((n) => ({
      id: n.noteId,
      content: n.content,
    }));
  },
});

// List notes for a specific chapter
export const listByChapter = query({
  args: {
    bookPath: v.string(),
    chapter: v.number(),
  },
  handler: async (ctx, { bookPath, chapter }) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_book_chapter", (q) =>
        q.eq("bookPath", bookPath).eq("chapter", chapter)
      )
      .collect();

    return notes.map((n) => ({
      id: n.noteId,
      content: n.content,
    }));
  },
});

// Add a note
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

// Update a note
export const update = mutation({
  args: {
    id: v.id("notes"),
    content: v.string(),
  },
  handler: async (ctx, { id, content }) => {
    return await ctx.db.patch(id, { content });
  },
});

// Delete a note
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id);
  },
});
```

**1.3 Create `convex/variants.ts`**

```ts
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// List all variants for a book
export const listByBook = query({
  args: { bookPath: v.string() },
  handler: async (ctx, { bookPath }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book", (q) => q.eq("bookPath", bookPath))
      .collect();

    return variants.map((v) => ({
      id: v.variantId,
      simplifications: v.simplifications,
    }));
  },
});

// List variants for a specific chapter
export const listByChapter = query({
  args: {
    bookPath: v.string(),
    chapter: v.number(),
  },
  handler: async (ctx, { bookPath, chapter }) => {
    const variants = await ctx.db
      .query("variants")
      .withIndex("by_book_chapter", (q) =>
        q.eq("bookPath", bookPath).eq("chapter", chapter)
      )
      .collect();

    return variants.map((v) => ({
      id: v.variantId,
      simplifications: v.simplifications,
    }));
  },
});

// Add a variant
export const create = mutation({
  args: {
    bookPath: v.string(),
    variantId: v.string(),
    chapter: v.number(),
    simplifications: v.array(
      v.object({
        score: v.number(),
        sentences: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("variants", args);
  },
});

// Update variant simplifications
export const update = mutation({
  args: {
    id: v.id("variants"),
    simplifications: v.array(
      v.object({
        score: v.number(),
        sentences: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, { id, simplifications }) => {
    return await ctx.db.patch(id, { simplifications });
  },
});

// Delete a variant
export const remove = mutation({
  args: { id: v.id("variants") },
  handler: async (ctx, { id }) => {
    return await ctx.db.delete(id);
  },
});
```

**1.4 Update `convex/bookQueries.ts`**

Replace stub implementations:

```ts
// Remove stub implementations, import from dedicated files
export { listByBook as listNotes } from "./notes";
export { listByBook as listVariants } from "./variants";
```

### Phase 2: Player Integration

**2.1 Update `BookConvexContext.tsx`**

```ts
// Replace stub queries with real ones
const notesQuery = useQuery(api.notes.listByBook, { bookPath });
const variantsQuery = useQuery(api.variants.listByBook, { bookPath });

// These already return the correct format { id, content } and { id, simplifications }
```

**2.2 No changes needed to:**
- `highlightFootnote.ts` - already uses `getNotes()` from store
- `findSimplifiedSentence.ts` - already uses `getAllVariants()` from store
- `bookDataStore.ts` - types already match

### Phase 3: CMS Editor

**3.1 Create `NotesEditor.tsx`**

Features:
- List notes with search/filter
- Inline edit content (rich text)
- Add new note with auto-generated ID
- Delete with confirmation
- Real-time updates via Convex subscription

**3.2 Create `VariantsEditor.tsx`**

Features:
- List variants grouped by chapter
- Show sentence ID
- Edit simplifications (score slider + text areas)
- Add/remove simplification levels
- Visual score indicator (color gradient)

**3.3 Add to CMS navigation**

Update BookDashboard to include notes/variants sections.

### Phase 4: Import Script

```ts
// scripts/import-notes-variants.ts

import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";

async function importNotesForBook(
  client: ConvexClient,
  bookSlug: string,
  getChapterXml: (chapterNum: number) => Promise<string>
) {
  const bookPath = `books/${bookSlug}`;

  // 1. Load legacy notes
  const { getNotes } = await import(`../books/${bookSlug}/getNotes`);
  const allNotes = getNotes();

  // 2. Build lookup: "fn1" -> { id, content }
  const noteMap = new Map(allNotes.map((n) => [n.id, n]));

  // 3. For each chapter, find which notes are used
  const chapterCount = /* get from book metadata */;

  for (let chapterNum = 1; chapterNum <= chapterCount; chapterNum++) {
    const xml = await getChapterXml(chapterNum);

    // Find <note id='X'> tags
    const regex = /<note\s+id=['"](\d+)['"]/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
      const noteNum = match[1];           // "1", "37"
      const noteId = `fn${noteNum}`;      // "fn1", "fn37"

      const note = noteMap.get(noteId);
      if (note) {
        await client.mutation(api.notes.create, {
          bookPath,
          noteId: note.id,
          content: note.content,
          chapter: chapterNum,
        });
        // Remove from map to avoid duplicates
        noteMap.delete(noteId);
      }
    }
  }

  // 4. Warn about orphaned notes (in getNotes but not referenced in any chapter)
  if (noteMap.size > 0) {
    console.warn(`Orphaned notes not found in any chapter:`, [...noteMap.keys()]);
  }
}

async function importVariantsForBook(client: ConvexClient, bookSlug: string) {
  const bookPath = `books/${bookSlug}`;

  const { getAllVariants } = await import(`../books/${bookSlug}/getAllVariants`);
  const allVariants = getAllVariants();

  for (const variant of allVariants) {
    // Extract chapter from ID: "ch1-p9-s1" -> 1
    const chapterMatch = variant.id.match(/^ch(\d+)/);
    const chapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;

    await client.mutation(api.variants.create, {
      bookPath,
      variantId: variant.id,
      chapter,
      simplifications: variant.simplifications.map((s) => ({
        score: s.score,
        sentences: s.sentences,
      })),
    });
  }
}
```

---

## Task Checklist

### Backend
- [ ] Add `notes` table to `convex/schema.ts`
- [ ] Add `variants` table to `convex/schema.ts`
- [ ] Create `convex/notes.ts` with queries and mutations
- [ ] Create `convex/variants.ts` with queries and mutations
- [ ] Update `convex/bookQueries.ts` to use new queries
- [ ] Add noteCount/variantCount to getBookStats

### Player
- [ ] Update `BookConvexContext.tsx` to use new queries
- [ ] Verify `highlightFootnote.ts` works with Convex data
- [ ] Verify `findSimplifiedSentence.ts` works with Convex data

### CMS
- [ ] Create `NotesEditor.tsx`
- [ ] Create `VariantsEditor.tsx`
- [ ] Add notes/variants to BookDashboard
- [ ] Add routing in AdminPanel

### Data Import
- [ ] Create import script
- [ ] Import Lalka notes (scan chapters for <note id='X'>)
- [ ] Import Romeo-And-Juliet variants (extract chapter from ID)
- [ ] Import other books as needed

---

## Future Considerations

### Unified Chapter Data Query

When ready to implement the sliding window approach:

```ts
// convex/chapterData.ts
export const getChapterData = query({
  args: {
    bookPath: v.string(),
    chapterNumber: v.number(),
  },
  handler: async (ctx, { bookPath, chapterNumber }) => {
    // Parallel queries
    const [notes, variants, backgrounds, music] = await Promise.all([
      ctx.db.query("notes")
        .withIndex("by_book_chapter", q => q.eq("bookPath", bookPath).eq("chapter", chapterNumber))
        .collect(),
      ctx.db.query("variants")
        .withIndex("by_book_chapter", q => q.eq("bookPath", bookPath).eq("chapter", chapterNumber))
        .collect(),
      // backgrounds and music queries...
    ]);

    return { notes, variants, backgrounds, music };
  },
});
```

### Reactivity Isolation

The player already handles this well via separate context/state slices. Each consumer (footnote modal, simplification modal, etc.) subscribes only to what it needs.
