# CMS - Admin Interface

Admin interface for managing book content, character assets, cues, and pipeline using Next.js 15 and Convex.

## Structure

```
app/           # Next.js App Router
admin/         # Core CMS implementation
├── components/
│   ├── book/      # Dashboard, Chapters, Characters views
│   ├── dialogs/   # Creation and asset selection modals
│   └── editors/   # XML, Metadata, Chapter editors
lib/           # Shared hooks, contexts, queries
components/ui/ # Radix + Tailwind base components
```

## Key Locations

| Task              | Location                                        |
| ----------------- | ----------------------------------------------- |
| Chapter editing   | `admin/components/book/ChapterEditorView.tsx`   |
| Character bundles | `admin/components/book/CharacterBundleView.tsx` |
| CMS queries       | `lib/queries.ts`                                |
| Book state        | `lib/contexts/BookContext.tsx`                  |
| Asset uploads     | `admin/components/UploadDialog.tsx`             |

## Key Components

- **BookDashboard**: Root view for book content management
- **FolderTree / AssetList**: Convex-managed asset explorer
- **CharacterGrid**: AI avatar and voice sample management
- **CuesView**: Background and music asset synchronization

## Notes

- Uses `@convex-dev/react-query` for cached data fetching
- Asset paths follow `books/[BOOK]/...` convention
