# AGENTS - BookGenius CMS

## OVERVIEW

Admin interface for managing book content, character assets, cues, and production pipeline using Next.js 15 and Convex.

## STRUCTURE

```
./
├── app/                  # Next.js App Router (Layout, Providers, /admin route)
├── admin/                # Core CMS implementation
│   └── components/       # Component library organized by domain
│       ├── book/         # Dashboard, Chapters, Characters, Cues views
│       ├── dialogs/      # Modals for creation and asset selection
│       ├── editors/      # XML, Metadata, and Chapter content editors
│       └── ...           # Asset management (FolderTree, AssetList)
├── lib/                  # Shared logic: hooks, contexts, queries, types
└── components/ui/        # Base Radix + Tailwind components
```

## WHERE TO LOOK

| Task                       | Location                                        |
| -------------------------- | ----------------------------------------------- |
| Edit Chapter logic         | `admin/components/book/ChapterEditorView.tsx`   |
| Character asset bundles    | `admin/components/book/CharacterBundleView.tsx` |
| XML/Monaco integration     | `admin/components/editors/XmlEditor.tsx`        |
| CMS-specific data fetching | `lib/queries.ts`                                |
| Book state management      | `lib/contexts/BookContext.tsx`                  |
| Asset upload workflow      | `admin/components/UploadDialog.tsx`             |

## KEY COMPONENTS

- **BookDashboard**: Root view for book-specific content management.
- **ChapterEditor**: Interactive editing interface for XML/Chapter content.
- **FolderTree / AssetList**: Unified explorer for Convex-managed assets.
- **CharacterGrid / BundleView**: AI-avatar and voice sample management.
- **CuesView**: Management of synchronized background and music assets.

## NOTES

- Uses `@convex-dev/react-query` for type-safe, cached data fetching.
- Heavy reliance on Monaco-based editors for structured content.
- Asset paths follow the `books/[BOOK]/...` convention in R2/Convex.
