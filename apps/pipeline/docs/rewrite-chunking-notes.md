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

## Queue and fallback behavior

- Primary rewrite calls run through a shared Gemini/Vertex queue.
- Primary provider selection is round-robin.
- Retryable infra errors (for example 429/5xx/gateway/timeouts) are retried in the primary queue.
- Validation or non-retryable provider failures trigger fallback pair calls:
- GPT-5 and Grok run in parallel through dedicated fallback queues.
- GPT-5 is preferred when both succeed.
- Grok can be selected when GPT-5 fails.

## Benchmark artifacts

Per-run benchmark artifacts are stored under:

- `books-data/<slug>/temporary-output/rewrite-benchmarks/<run-id>/`

Main files:

- `manifest.ndjson` one row per attempt (provider, phase, status, artifacts, winner flag)
- `summary.json` aggregate counts and fallback stats
- `outputs/` raw/restored responses per provider attempt
- `diffs/` high-level comparisons of non-selected outputs vs selected output

To inspect a run quickly:

- `bun src/tools/rewrite-benchmark-report.ts` (latest run)
- `bun src/tools/rewrite-benchmark-report.ts <run-id>` (specific run)

How to detect Grok-as-final due GPT-5 failure:

- Check `summary.json` field `grokSelectedDueToGptFailure`.
- Filter `manifest.ndjson` for rows where `selectedAsFinal=true` and `provider=\"grok\"`.

## Relevant code

- `apps/pipeline/src/tools/identifyEntityAndRewriteParagraphs.ts`
- `apps/pipeline/src/tools/chapterChunker.ts`
- `apps/pipeline/src/tools/rewrite-orchestrator.ts`
- `apps/pipeline/src/tools/rewrite-benchmark-report.ts`
