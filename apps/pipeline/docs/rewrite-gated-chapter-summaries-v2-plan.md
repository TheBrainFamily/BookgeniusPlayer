# Rewrite-Gated Chapter Bullet Summaries with Per-Character Chapter Actions (V2)

## Scope

- Update `apps/pipeline/src/tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary.ts`
- Update `apps/pipeline/src/server/parallel-scheduler.ts`
- Add integration/parser tests + scheduler dependency tests
- Exclude queue/rate-limit changes for this step

## Locked Decisions

1. `map_summaries_to_paragraphs` depends on `rewrite_paragraphs` (hard gate).
2. Missing `rewritten-paragraphs-for-chapter-N.xml` fails the step.
3. Extract detected characters from rewritten XML using both `data-c` and `data-speaker`.
4. LLM returns lean actions (`slug`, `chapterAction`); app composes full per-chapter character records.
5. Unknown/extra slugs returned by LLM are kept and upserted.
6. `isFirstAppearance` uses two-pass pre-scan across all chapters.

## Implementation

1. Scheduler dependency update in `parallel-scheduler.ts`:
   - `map_summaries_to_paragraphs`: `deps` from `make_chapter_summaries` -> `rewrite_paragraphs`.

2. In `get-chapter-by-chapter-with-paragraphs-json-summary.ts`:
   - Add helper to read rewritten chapter XML from temporary output.
   - Add helper to extract detected characters from XML (`data-c`, `data-speaker`).
   - Add helper to build first-appearance map from all chapters.
   - Read `single-summary-per-person.json` (permanent output) and build slug->reference map using `generateTagName`.
   - Extend LLM schema: optional `chapterSummary.characterActions` with `{ slug, chapterAction }`.
   - Add additive output field per chapter: `chapterCharacters` (full shape):
     - `name`, `slug`, `referenceCard`, `chapterAction`, `mentioned`, `speaking`.
   - Prompt `Detected Characters` section gets serialized chapter-specific list with slug/name/referenceCard/flags.
   - Two-pass execution:
     - Pass 1: read/parse all rewritten XMLs and compute `firstAppearanceBySlug`.
     - Pass 2: run chapter LLM calls in parallel, merge lean actions + detected chars, include LLM extras with defaults, upsert Convex summaries.
   - Convex upsert:
     - `summary = chapterAction || referenceCard`
     - `isFirstAppearance` from precomputed map.

3. Convex integration in this step:
   - Use `convex.upsertCharacterChapterSummary` from `../../server/convex-client`.
   - Derive `bookPath` from selected book slug/path (`books/<slug>`).

## Tests (test-first)

1. New integration spec:
   - `apps/pipeline/src/tools/new-tooling/get-chapter-by-chapter-with-paragraphs-json-summary.spec.ts`
   - Mock: `readBookFile`, `writeBookFile`, `getBookSettings`, `getParagraphsFromChapter`, LLM calls, `convex.upsertCharacterChapterSummary`.
   - Validate:
     - prompt includes detected chars from rewritten XML
     - both `data-c` and `data-speaker` parsing
     - missing rewritten XML hard-fails
     - two-pass first appearance correctness under parallel execution
     - lean action merge into `chapterCharacters`
     - extras from LLM are kept and upserted with defaults
     - per-chapter and aggregate outputs include `chapterCharacters`

2. Scheduler tests:
   - `apps/pipeline/src/server/parallel-scheduler.spec.ts`
   - Validate:
     - `map_summaries_to_paragraphs` requires `rewrite_paragraphs`
     - no longer requires `make_chapter_summaries`

## Acceptance

- Step order enforces rewrite before mapping.
- Missing rewritten chapter file fails mapping step.
- Prompt gets chapter-specific detected characters.
- Outputs include additive `chapterCharacters`.
- Convex receives per-character chapter summary upserts (including unknown extras).
- Embeddings pipeline remains compatible.
