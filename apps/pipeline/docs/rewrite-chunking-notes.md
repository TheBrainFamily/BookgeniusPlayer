# Rewrite Chunking Restart Notes

Use this checklist before restarting or resuming `rewrite_paragraphs` runs that use chunked chapter processing.

## Why this exists

`identifyEntityAndRewriteParagraphs.ts` supports resumable chunk outputs. If temporary chunk files from different code/prompt/model versions get mixed, continuity can degrade even if the pipeline finishes.

## Safe to resume without cleanup

- Same code version.
- Same prompt templates and prompt assembly.
- Same model/provider behavior.
- Same chunking behavior and context strategy.
- Run was interrupted and is being resumed as-is.

## Invalidate chunk cache first if anything changed

- Prompt content, context, or formatting.
- Model/provider selection or fallback behavior.
- Rewrite post-processing (restore/sanitize/compare).
- Chunk context strategy (for example, how chunk 1 gets context).
- Retry or validation rules.

## What to clear for affected chapters

From `books-data/<slug>/temporary-output`, clear all per-chapter chunk artifacts:

- `rewritten-paragraphs-for-chapter-<N>-chunk-*.xml`
- `rewritten-paragraphs-for-chapter-<N>-chunk-*.raw.xml`
- `compiled-prompt-for-chapter-<N>-chunk-*.md`
- `original-paragraphs-for-chapter-<N>-chunk-*.xml`
- `broken-rewritten-paragraphs-for-chapter-<N>-chunk-*.xml`

Also decide intentionally on the final file:

- Keep `rewritten-paragraphs-for-chapter-<N>.xml` if chapter should be treated as complete.
- Remove it if chapter should be recomputed.

## Quick post-restart checks

- Logs should show expected regeneration, not stale "already rewritten" reuse.
- Spot-check compiled prompt for chunk 1 context.
- Spot-check chunk boundaries in final combined chapter XML.

## Relevant code

- `apps/pipeline/src/tools/identifyEntityAndRewriteParagraphs.ts`
- `apps/pipeline/src/tools/chapterChunker.ts`
