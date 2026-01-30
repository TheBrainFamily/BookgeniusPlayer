# Convex Backend

Backend-as-a-Service for data persistence, media orchestration, and AI content generation.

## Key Files

| File                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `schema.ts`            | All table definitions                              |
| `bookQueries.ts`       | Domain queries: books, characters, chapters, cues  |
| `generateUploadUrl.ts` | Intent-based upload flow (start → upload → finish) |
| `avatarGeneration.ts`  | AI avatar generation with OpenAI                   |
| `paragraphEditor.ts`   | Server-side XML manipulation                       |
| `cli.ts`               | Admin operations for Convex CLI                    |

## Schema Overview

- `notes` - Annotations and footnotes
- `variants` - AI-generated sentence simplifications
- `backgroundCues` / `musicCues` - Media-to-paragraph mapping
- `bookGenerationJobs` - Pipeline progress tracking

## Patterns

See [docs/conventions/convex-patterns.md](../docs/conventions/convex-patterns.md) for:

- Intent-based uploads
- Folder conventions

## Testing

```bash
bunx vitest run convex/
```
