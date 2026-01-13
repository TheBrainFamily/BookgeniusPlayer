# Codebase Guide for Agents

## Overview

This monorepo contains two main applications:

- **apps/player** - React-based book reader with virtualized scrolling, character animations, and interactive features
- **apps/bookgenius-cms** - Next.js admin panel for managing book content via Convex

Both apps share a Convex backend located in `/convex`.

---

## apps/player

Interactive book reader application built with React + Vite.

### Entry Points

| File                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `src/main.ts`         | Application entry point, initializes the player |
| `src/index.tsx`       | Root React component                            |
| `src/LiveModeApp.tsx` | Main app component for live/Convex mode         |

### Context Providers

| File                                | Description                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/context/BookConvexContext.tsx` | **Primary data provider** - fetches book data from Convex, processes XML to HTML, manages chapters, characters, notes, variants |
| `src/context/HighlightContext.tsx`  | Manages text highlighting state                                                                                                 |
| `src/context/RealtimeContext.tsx`   | Real-time updates handling                                                                                                      |

### Core Logic

| File                                  | Description                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `src/logic/BookIndex.ts`              | Parses book HTML, indexes chapters, manages `data-chapter-wrapper` attributes |
| `src/logic/BookContentVirtualizer.ts` | Virtual scrolling - only renders visible chapters for performance             |
| `src/logic/TextCacheManager.ts`       | Caches chapter content                                                        |

### State Management

| File                            | Description                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/state/bookDataStore.ts`    | Global store for book data accessible outside React (defines `Note` and `Variant` types) |
| `src/state/LocationContext.tsx` | Current reading position (chapter, paragraph)                                            |
| `src/stores/*.store.ts`         | Zustand stores for UI state (modals, content shift, etc.)                                |

### Services

| File                                      | Description                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/live/xmlProcessor.ts`       | **XML to HTML conversion** - transforms chapter XML to player HTML, handles play/prose formats, adds `.play-container` wrapper |
| `src/services/live/characterExtractor.ts` | Extracts character metadata from XML                                                                                           |
| `src/services/chapterRenderer.ts`         | Renders individual chapters to DOM                                                                                             |
| `src/services/ScrollCoordinator.ts`       | Coordinates scroll behavior                                                                                                    |

### Hooks

| File                          | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `src/hooks/useBookContent.ts` | Main hook for book content - sets up observers, adds `play-mode` class |
| `src/hooks/useBookForm.ts`    | Returns book format (play/prose/mixed)                                 |
| `src/hooks/useEditorMode.ts`  | Editor mode toggle                                                     |
| `src/hooks/usePaywall.ts`     | Demo/paywall logic                                                     |

### UI Components

| File                              | Description                                          |
| --------------------------------- | ---------------------------------------------------- |
| `src/ui/pageObserver.ts`          | IntersectionObserver for tracking visible paragraphs |
| `src/ui/activateMediaInRange.ts`  | Activates character videos in visible range          |
| `src/ui/highlightFootnote.ts`     | Footnote display (uses `getNotes()` from store)      |
| `src/ui/paragraphHighlighting.ts` | Paragraph highlighting logic                         |
| `src/ui/background.ts`            | Background image/video management                    |

### Helpers

| File                                           | Description                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `src/helpers/findSimplifiedSentence.ts`        | Finds simpler versions of sentences (uses `getAllVariants()`) |
| `src/helpers/paragraphsNavigation.ts`          | Navigate between paragraphs                                   |
| `src/helpers/activateCharacterInteractions.ts` | Character click handlers                                      |
| `src/helpers/activateFootnoteInteractions.ts`  | Footnote click handlers                                       |

### Types

| File                       | Description                                                   |
| -------------------------- | ------------------------------------------------------------- |
| `src/types/book.ts`        | Core book types: `BookData`, `CharacterData`, `Chapter`, etc. |
| `src/types/bookContext.ts` | Context-related types                                         |

---

## apps/bookgenius-cms

Next.js admin panel for content management.

### App Routes

| File                 | Description                |
| -------------------- | -------------------------- |
| `app/page.tsx`       | Landing page               |
| `app/admin/page.tsx` | Main admin panel route     |
| `app/layout.tsx`     | Root layout with providers |
| `app/providers.tsx`  | Convex provider setup      |

### Admin Panel

| File                   | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `admin/AdminPanel.tsx` | Main admin UI - three-panel layout (folder tree, asset list, detail) |

### Components - Core

| File                                | Description                       |
| ----------------------------------- | --------------------------------- |
| `admin/components/FolderTree.tsx`   | Folder navigation sidebar         |
| `admin/components/AssetList.tsx`    | List of assets in a folder        |
| `admin/components/AssetDetail.tsx`  | Asset preview and version history |
| `admin/components/AssetCard.tsx`    | Card view for assets              |
| `admin/components/AssetListRow.tsx` | Row view for assets               |

### Components - Book-Specific

| File                                            | Description                                |
| ----------------------------------------------- | ------------------------------------------ |
| `admin/components/book/BookDashboard.tsx`       | Book overview with stats                   |
| `admin/components/book/BookAwareAssetList.tsx`  | Smart asset list that detects book context |
| `admin/components/book/CharacterGrid.tsx`       | Grid of character avatars                  |
| `admin/components/book/CharacterDetailView.tsx` | Character editing                          |
| `admin/components/book/CharacterBundleView.tsx` | Character with all assets                  |
| `admin/components/book/ChaptersView.tsx`        | Chapter list                               |
| `admin/components/book/ChapterEditorView.tsx`   | Chapter XML editor                         |

### Components - Editors

| File                                          | Description                                 |
| --------------------------------------------- | ------------------------------------------- |
| `admin/components/editors/ChapterEditor.tsx`  | XML editor for chapters                     |
| `admin/components/editors/XmlEditor.tsx`      | Generic XML editor with syntax highlighting |
| `admin/components/editors/MetadataEditor.tsx` | JSON metadata editor                        |

### Components - Dialogs

| File                                                 | Description          |
| ---------------------------------------------------- | -------------------- |
| `admin/components/UploadDialog.tsx`                  | File upload dialog   |
| `admin/components/CreateFolderDialog.tsx`            | New folder dialog    |
| `admin/components/dialogs/CreateChapterDialog.tsx`   | New chapter dialog   |
| `admin/components/dialogs/CreateCharacterDialog.tsx` | New character dialog |

### Scripts

| File                    | Description                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `scripts/importBook.ts` | **Generic book importer** - imports from legacy `books/` folder including notes and variants |
| `scripts/import1984.ts` | Legacy 1984-specific importer                                                                |
| `scripts/resetBooks.ts` | Reset book data                                                                              |

### Lib

| File                           | Description                |
| ------------------------------ | -------------------------- |
| `lib/contexts/BookContext.tsx` | Book context for CMS       |
| `lib/types/book.ts`            | Book-related types for CMS |
| `lib/queries.ts`               | Convex query helpers       |

---

## /convex (Shared Backend)

| File                   | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `schema.ts`            | Database schema - includes `notes` and `variants` tables                         |
| `bookQueries.ts`       | Book-related queries (chapters, characters, backgrounds, music, notes, variants) |
| `notes.ts`             | Notes CRUD operations                                                            |
| `variants.ts`          | Variants CRUD operations                                                         |
| `cli.ts`               | CLI operations (folder management, text content fetch)                           |
| `generateUploadUrl.ts` | File upload handling                                                             |

---

## Key Data Flow

### Player Loading

```
BookConvexContext
  → useQuery(listChapters, listCharacters, etc.)
  → processChapters()
    → getChapterContent() for each chapter
    → xmlToComplexHtml() converts XML to HTML
    → extractCharacterMetadata()
  → setBookStringified(htmlResult)
  → BookIndex.parse(html)
  → BookContentVirtualizer renders visible chapters
```

### Book Form Handling

- Metadata stores `form: "Play"` or `form: "Mixed"` or `form: "prose"`
- `BookConvexContext` normalizes to lowercase in `bookData.metadata.bookForm`
- `xmlProcessor.ts` uses original case for HTML generation (adds `.play-container`)
- `useBookContent.ts` adds `play-mode` class to `#book-container`

### Notes & Variants

- Stored in native Convex tables (`notes`, `variants`)
- Indexed by `bookPath` and `chapter` for efficient queries
- Player queries via `listNotes` / `listVariants` in `bookQueries.ts`
- Used by `highlightFootnote.ts` and `findSimplifiedSentence.ts`

---

## Legacy Books Structure

```
books/{slug}/
  ├── booksContent/
  │   ├── metadata.xml      # Book metadata + characters
  │   └── chapter{N}.xml    # Chapter content
  ├── assets/               # Media files
  ├── getNotes.ts           # Footnotes array
  ├── getAllVariants.ts     # Sentence simplifications
  ├── getBackgroundsForBook.ts
  └── getBackgroundSongsForBook.ts
```

Import with: `bun run scripts/importBook.ts {slug}`
