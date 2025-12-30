# PIPELINE SERVER

tRPC-based orchestration server for the book generation pipeline. Transforms EPUB/FB2 files into fully-processed interactive books with character detection, image generation, and semantic search.

## QUICK START

```bash
# Start server (port 4000)
cd backend/server && tsx src/index.ts

# Start new pipeline from FB2
tsx src/pipeline-cli.ts path/to/book.fb2 --slug my-book

# Check pipeline status
tsx src/continue-pipeline-cli.ts books-data/my-book --status

# Resume interrupted pipeline
tsx src/continue-pipeline-cli.ts books-data/my-book

# Resume from specific step
tsx src/continue-pipeline-cli.ts books-data/my-book --from-step generate_backgrounds

# List all steps
tsx src/continue-pipeline-cli.ts --list-steps
```

## PIPELINE STEPS (IN ORDER)

| #   | Step Slug                     | What It Does                                           | Output Files                                                |
| --- | ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 1   | `import_epub`                 | Convert EPUB→FB2→rich.xml, extract inline images       | `input/rich.xml`, `input/bookChapters.xml`                  |
| 2   | `create_settings`             | Detect language, extract title/author, create settings | `temporary-output/bookSettings.json`                        |
| 3   | `generate_reference_cards`    | LLM generates character summaries (spoiler-free)       | `output/single-summary-per-person.json`                     |
| 4   | `rewrite_paragraphs`          | LLM injects `<CharacterName talking="true"/>` tags     | `temporary-output/rewritten-paragraphs-for-chapter-{N}.xml` |
| 5   | `generate_graphical_style`    | LLM creates visual style (period, background, avatar)  | `temporary-output/graphicalStyle.json`                      |
| 6   | `generate_backgrounds`        | Generate background images from chapter content        | `output/backgrounds/{chapter}-{paragraph}.png`              |
| 7   | `generate_entity_pictures`    | Generate character avatar images (OpenAI DALL-E)       | `output/characters/{slug}.png`                              |
| 8   | `make_chapter_summaries`      | Create rolling chapter-by-chapter summaries            | `temporary-output/summaries-chapter-by-chapter-{N}.txt`     |
| 9   | `map_summaries_to_paragraphs` | Convert summaries to paragraph-mapped bullet points    | `temporary-output/chapter-{N}-bullet-points.json`           |
| 10  | `generate_embeddings`         | Create semantic embeddings for search (Voyage AI)      | `temporary-output/embeddings.json`                          |
| 11  | `upload_answer_server_data`   | Upload embeddings + rich.xml to R2                     | R2: `answer-server-data/{slug}/`                            |

## PROGRESS TRACKING

Progress is persisted in `books-data/{slug}/temporary-output/pipeline-progress.json`:

```json
{
  "slug": "my-book",
  "startedAt": "2025-12-30T10:00:00Z",
  "updatedAt": "2025-12-30T10:30:00Z",
  "completedSteps": {
    "import_epub": { "status": "done", "startedAt": "...", "endedAt": "..." },
    "create_settings": { "status": "done", "startedAt": "...", "endedAt": "..." },
    "generate_reference_cards": { "status": "error", "error": "API timeout" }
  },
  "lastCompletedStep": "create_settings",
  "lastAttemptedStep": "generate_reference_cards"
}
```

**Resume behavior**: Pipeline auto-detects next incomplete step. Use `--from-step` to override.

**Mark steps as done** (for manual recovery):

```bash
tsx src/continue-pipeline-cli.ts books-data/my-book --mark-completed rewrite_paragraphs
```

## API ENDPOINTS (tRPC)

| Procedure                     | Type     | Purpose                                  |
| ----------------------------- | -------- | ---------------------------------------- |
| `startPipeline`               | mutation | Start full pipeline from EPUB/FB2 path   |
| `getJobStatus`                | query    | Poll job progress, logs, errors          |
| `prepareFromEpub`             | mutation | Convert EPUB only (no full pipeline)     |
| `prepareFromFb2`              | mutation | Convert FB2 only (no full pipeline)      |
| `getRichXml`                  | query    | Get rich.xml content for editing         |
| `saveRichXml`                 | mutation | Save edited rich.xml                     |
| `regenerateChapterEmbeddings` | mutation | Regenerate embeddings for single chapter |
| `searchWolneLektury`          | query    | Search Polish public domain books        |
| `downloadFromWolneLektury`    | mutation | Download and convert Polish book         |

## CONVEX INTEGRATION

The pipeline uploads results to Convex in real-time via `convex-client.ts`:

```typescript
// Book structure
await convex.ensureBookStructure({ jobId, bookSlug, metadata });

// Progress reporting
await convex.reportProgress({ bookPath, step, status: "running" });

// Character folders
await convex.ensureCharacterFolder({ bookPath, characterSlug, displayName, summary, aiPrompt });

// File uploads (intent-based)
await convex.uploadFile({ folderPath, basename, content, contentType, publish: true });

// Background/music cues
await convex.upsertBackgroundCue({ bookPath, chapter, paragraph, fileBasename });
```

## CHAPTER REGENERATION

Regenerate single chapters without running full pipeline:

```bash
# From local files
tsx src/regenerate-chapter.ts my-book-slug 3 --upload

# From Convex (fetches XML from backend)
tsx src/regenerate-chapter-from-convex.ts my-book-slug 3
```

**Process**:

1. Fetch chapter XML (local or Convex)
2. Strip existing character tags
3. Re-run LLM to inject fresh tags
4. Optionally upload back to Convex

## UTILITY SCRIPTS

| Script                          | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `fix-lowercase-tags.ts`         | Fix character tag case (e.g., `<winston>` → `<Winston>`) |
| `regenerate-missing-avatars.ts` | Find characters without avatars and generate them        |
| `chapter-xml-helpers.ts`        | XML parsing utilities for character extraction           |

## FILE STRUCTURE

```
server/src/
├── index.ts              # Express + tRPC server entry
├── router.ts             # All tRPC procedures
├── trpc.ts               # tRPC initialization
├── pipeline.ts           # Main pipeline orchestration (Job, runStep, startPipeline)
├── pipeline-cli.ts       # CLI: start new pipeline
├── continue-pipeline-cli.ts  # CLI: resume/status/mark-completed
├── pipeline-progress.ts  # Progress persistence and tracking
├── convex-client.ts      # Convex HTTP client wrapper
├── regenerate-chapter.ts # Single chapter regeneration (local)
├── regenerate-chapter-from-convex.ts  # Single chapter regeneration (Convex)
├── chapter-xml-helpers.ts # XML utilities
├── fix-lowercase-tags.ts # Tag case correction
├── regenerate-missing-avatars.ts  # Batch avatar generation
└── wolne-lektury/        # Polish book API integration
    ├── index.ts          # API client
    ├── service.ts        # Business logic
    └── types.ts          # Type definitions
```

## ERROR HANDLING

- **Step failure**: Pipeline stops, marks step as error, saves progress
- **Resume**: Auto-retries failed step on next run
- **Skip quick mode**: Set `QUICK_MODE=true` to skip summary/embedding steps
- **Logs**: All steps logged with timestamps, viewable via `getJobStatus`

## ENVIRONMENT

```bash
PORT=4000                    # Server port (default)
CONVEX_URL=                  # Required for uploads
EBOOK_CONVERT_BIN=           # Path to calibre's ebook-convert (macOS: /Applications/calibre.app/Contents/MacOS/ebook-convert)
QUICK_MODE=true              # Skip steps 8-11 for faster testing
```

## TYPICAL WORKFLOW

1. **Upload EPUB** → Server converts to FB2, then rich.xml
2. **Start pipeline** → Server runs all steps, reports progress to Convex
3. **Monitor** → Frontend polls `getJobStatus` for logs and progress
4. **Handle errors** → Resume with `continue-pipeline-cli.ts`
5. **Edit content** → Use CMS to edit chapters, regenerate single chapters as needed
6. **Publish** → Book appears in player via Convex queries
