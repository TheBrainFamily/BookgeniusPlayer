# Convex Patterns

## Intent-Based Uploads

All file uploads follow a three-step flow:

```
startUpload() → Client uploads to URL → finishUpload()
```

The `finishUpload` step triggers post-processing hooks (WebP conversion, preview generation).

## Storage

Assets use R2.

## Folder Conventions

Strict path structure for all assets:

```
books/{book-slug}/
├── characters/{character-slug}/
│   ├── avatar.webp
│   ├── speaks.mp4
│   └── listens.mp4
├── backgrounds/
└── music/
```

## Key Files

| File                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `bookQueries.ts`       | Domain queries: characters, chapters, cues |
| `generateUploadUrl.ts` | Upload orchestration with hooks            |
| `avatarGeneration.ts`  | AI avatar generation (OpenAI)              |
| `paragraphEditor.ts`   | XML manipulation for chapters              |
| `schema.ts`            | All table definitions                      |

## Testing

```bash
bunx vitest run convex/
```
