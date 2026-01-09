# CONVEX BACKEND

Backend-as-a-Service providing data persistence, media orchestration, and AI-powered content generation.

## SCHEMA

- `notes`: Annotations and footnotes for book chapters/paragraphs.
- `variants`: AI-generated sentence simplifications for different reading levels.
- `backgroundCues` / `musicCues`: Spatial mapping of media assets to book positions.
- `musicFileMetadata` / `backgroundFileMetadata`: Processed media metadata (previews, duration).
- `bookGenerationJobs`: Progress tracking for the book processing pipeline.
- `authTables`: Integrated Convex Auth tables.

## KEY FILES

| File                   | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `bookQueries.ts`       | Domain-specific queries for books, characters, and assets.     |
| `generateUploadUrl.ts` | Intent-based upload orchestration (Start -> Upload -> Finish). |
| `avatarGeneration.ts`  | OpenAI-integrated actions for character avatar generation.     |
| `paragraphEditor.ts`   | Server-side XML manipulation for character/speaker assignment. |
| `chapterCompiler.ts`   | Logic for processing and compiling chapter HTML/XML.           |
| `cli.ts`               | Admin operations exposed for Convex CLI.                       |
| `authHelpers.ts`       | Clerk-based authentication guards (`requireAuth`).             |

## PATTERNS

- **Asset Management**: Delegates core storage logic to `components/asset-manager/`.
- **Intent-Based Uploads**: `startUpload` (returns URL) -> Client Upload -> `finishUpload` (triggers post-processing).
- **Dual Storage**: Transparently handles both Convex internal storage and Cloudflare R2.
- **Action-Heavy**: Uses Actions for long-running AI generation (GPT-4o, DALL-E 3) and media processing.
- **Folder Conventions**: Strict structure (`books/{slug}/characters/{slug}`) enforced via queries.

## COMPONENT: ASSET-MANAGER

The `convex/components/asset-manager/` is a modular file system providing versioning, folder structures, and dual-backend storage. See its specific `AGENTS.md` for internal details.

## TESTING

```bash
cd convex && bun test
```
