# Engineering Report: Feb 3-8, 2026

Author focus: `Lukasz Gandecki`  
Scope: commits on current branch `different-embedding-calculations` and `main`, from `2026-02-03` (inclusive)

## Executive Summary

This period was not "wheel spinning." It was a dense architecture-and-reliability week with visible product surface improvements.

- Commits: `40`
- Net code movement: `+34,321 / -4,297`
- Unique files touched: `218`
- Main branch activity in period: `2` commits (both already included in this branch history)

Primary outcomes:

1. Pipeline reliability was substantially hardened (rate-limit handling, Vertex fallback paths, abort/cancel semantics, step dependency checks, retry orchestration).
2. Standard Ebooks moved closer to production operation (queue tooling, notes import, metadata datasets, cover upload/bake workflow, deployment data).
3. Player UX improved meaningfully (image zoom modal, graphics controls, smoother progress semantics, character-name cleanup, chapter loading behavior).
4. Quality investment stayed high through tests and reproducibility tooling (large spec additions, benchmark-context collector, embedding integration coverage).

---

## 2026-02-04 (Tue) - 3 commits, +3,374 / -565

### 08:08 - `eb36d71b` - `+28/-276` (12 files) - update convex to 1.31.5 across packages

This commit synchronized Convex dependency versions across the monorepo package manifests and lockfile. It removed drift between apps and reduced risk of runtime mismatch between backend/client SDK expectations. This was a maintenance but strategically important commit because later pipeline and CMS/player updates rely on consistent Convex tooling behavior.

### 08:14 - `84ef3420` - `+0/-0` (merge) - merge pull request #9

This merge integrated the Convex upgrade path into `main` and then into your working history. Operationally, this matters as a baseline alignment point: subsequent changes in this report build on this dependency state.

### 20:17 - `d6aba0f5` - `+3346/-289` (71 files) - paragraph counts, unwrapped restore, and broad pipeline cleanup

This was a major text-processing and migration commit. You added dedicated repair scripts for legacy play/non-play chapter structures, unwrapped paragraph restoration, and non-HTML-tag scanning. You also added paragraph-count infrastructure and a backfill server path, which supports stronger text integrity checks and later progress calculations.

On pipeline tooling, you introduced multiple focused fixers with tests (custom tags, stage directions, didaskalia, multi-speaker handling), improved chapter-title extraction/testing, and tightened chapter upload/fix workflows. On the player side, you added minor-character handling and normalization tests, while removing older chapter-title utility paths. Net effect: significantly better source-to-render text fidelity and auditable repair tooling.

Simplified pattern introduced:

```ts
// Before: one-shot transform with weak guarantees
// After: explicit fix pipeline with measurable checks
for (const chapter of chapters) {
  const repaired = fixCustomTags(chapter);
  const restored = restoreUnwrappedBlocks(repaired);
  const counted = backfillParagraphCounts(restored);
  assertNoInvalidTags(counted);
}
```

---

## 2026-02-05 (Wed) - 4 commits, +1,184 / -197

### 10:57 - `d1f35dbc` - `+159/-2` (5 files) - wrapping/restoring unwrapped refinements

You extended the unwrapped-lines restoration path with `ensure-section-wrapper` helpers and tests. This tightened chapter XML structure guarantees so downstream rewrite/summarization logic can assume consistent section envelopes instead of ad hoc fallbacks.

### 14:09 - `2f18f5ce` - `+310/-30` (15 files) - free-run mode, raw LLM capture, generic avatar fallback, SE search

This commit introduced "free-run" behavior in the pipeline path and expanded tooling around experimentation. It also added a generic avatar fallback path, reducing failure impact when character image generation is incomplete. On the UI side, Standard Ebooks page behavior was expanded and search surface improved. You also added paragraph-sanitization logic/tests to prevent nested paragraph artifacts from propagating.

### 16:01 - `c93d7128` - `+656/-55` (24 files) - image zoom modal + pipeline/Convex workflow improvements

Player UX gained a full image-zoom feature with modal renderer/store wiring (`ImageZoomModal`, renderer, modal store). In parallel, pipeline CLI and scheduling paths were adjusted, including a new upload-figures CLI. Convex paragraph editing/generator paths were also touched, pointing to better round-trip editing of HTML content and safer operational tools.

### 17:22 - `f05340f3` - `+59/-110` (5 files) - Gemini timeout mitigation

You reduced timeout pressure in Gemini-dependent pipeline steps by changing call behavior and simplifying related flows. Supporting prompt generation and summary tooling were adjusted to cooperate with this path. This commit is small in file count but high leverage for run stability.

Simplified reliability shape:

```ts
try {
  return await callGeminiFast(prompt, { maxRetries: 0 });
} catch (err) {
  // fallback branch used by later commits too
  return await callAlternativeProvider(prompt);
}
```

---

## 2026-02-06 (Thu) - 8 commits, +20,640 / -734

### 08:28 - `b9a4aa1f` - `+2242/-212` (25 files) - Standard Ebooks ingestion + queue + notes + platform entry points

This was the first large Standard Ebooks productization wave. You added queueing/orchestration for SE processing, drama classification, notes parsing/import paths with tests, and significant converter updates. On the platform app, you introduced dedicated SE card/modal/page components and tRPC integration surface for loading this catalog. You also continued unwrapped restoration hardening with additional repro/spec coverage.

### 11:30 - `c41dba0c` - `+778/-79` (11 files) - platform carousel UX and library performance

You introduced a new `LibrarySection`, feature sections, and a dev performance monitor hook, plus broader polish to hero/featured/footer/i18n. The component and style changes strongly indicate focus on perceived responsiveness and browseability under a larger catalog.

### 11:31 - `6491d121` - `+0/-1` (1 file) - remove noisy log

Small but useful cleanup: removed redundant logging in media activation path, reducing console noise during runtime diagnostics.

### 15:59 - `e5df4b1a` - `+618/-187` (8 files) - checkpoint for automated pipeline improvements

Despite the generic message, this commit contains major reliability architecture work. You added robust Gemini rate-limit/quota detection and delay parsing, Vertex fallback (text + structured), and explicit abort helpers. Pipeline scheduling was updated to cancel cleanly and avoid marking aborted runs as generic failures. Rewrite tooling became abort-aware with signal checks across chunk processing.

Simplified pattern from this commit family:

```ts
if (isQuotaOrRateLimitError(err)) {
  const delay = extractRetryDelayMs(err);
  if (canUseVertex()) return callVertexFallback(prompt);
  if (delay) await sleep(delay);
}
```

### 16:01 - `a98284cc` - `+1088/-252` (15 files) - pipeline stability + library section evolution

You continued hardening with stream-safe Vertex handling and cache-oriented chapter/book parsing (`mtime`-aware caching). Operational scripts were added for SE cover upload + URL baking and queue running. You also introduced rewritten-text coverage verification tooling, which provides a direct quality gate between source text and rewritten output.

On platform, `LibrarySection` moved toward data-driven category rendering and CDN cover URLs, reducing runtime dependency on remote index APIs and improving predictable rendering behavior.

### 17:55 - `cf35d3e9` - `+35/-3` (4 files) - chapter dynamic loading improvements

You added explicit virtualization-window logic and integrated it into chapter content/preload flow. This improves memory/load behavior in long books and reduces visible content churn during navigation.

### 17:59 - `b21d7ea6` - `+10461/-0` (2 files) - missing metadata uploaded

You added large production datasets for SE catalog metadata (`book-meta.json`, `categories.json`). This unlocked immediate catalog grouping and card construction without live dependency on external index assembly.

### 18:47 - `a1403061` - `+5418/-0` (1 file) - descriptions for deployment

You completed SE deployment data by adding precomputed descriptions/hooks. Combined with prior metadata commit, this provided enough static catalog material for production-like browse and discovery UX.

---

## 2026-02-07 (Fri) - 16 commits, +6,634 / -1,712

### 08:24 - `5e78b167` - `+224/-26` (9 files) - genai upgrade + thinking + typography preservation

You upgraded `@google/genai`, enabled stronger thinking configuration for structured outputs, and preserved typographic characters instead of normalizing them away. That matters for literary quality in public-domain texts where punctuation style carries tone.

### 10:16 - `b1666640` - `+412/-94` (4 files) - chunk rewrite continuity + test coverage

You added large targeted tests for paragraph rewrite continuity and improved chunk logic accordingly. This directly addresses coherence between adjacent chunks, a common failure mode in chunked LLM rewriting.

### 12:04 - `38776894` - `+1599/-204` (14 files) - queued rewrite orchestrator + benchmark artifacts

This introduced a dedicated rewrite orchestrator with extensive tests and reporting support. It formalized queue-based rewrite execution, benchmark reporting, and prompt/path integration. Architecturally, this is a shift from ad hoc rewrite invocation toward controlled, measurable orchestration.

Simplified orchestration shape:

```ts
for (const chapter of chapters) {
  queue.enqueue(() => rewriteChapter(chapter, promptVariant));
}
await queue.drain();
writeBenchmarkReport(results);
```

### 12:14 - `53c50416` - `+36/-10` (1 file) - callO3 updates

Provider wrapper updates aligned call behavior with current model assumptions and retry settings.

### 12:46 - `f1ea823c` - `+8/-6` (7 files) - callO3 -> GPT-5 transition

You renamed/repointed provider wiring (`callO3` -> `callGpt5`) across rewrite/reference-card paths. This was a low-volume but important consistency migration.

### 12:46 - `95025b40` - `+590/-28` (2 files) - reference-card benchmarking across models

You introduced heavier benchmarking and test coverage for reference-card generation with GPT-5/Gemini variants, including sampled comparison logic. This improves confidence in quality-vs-cost routing decisions.

### 13:11 - `3dd233bb` - `+1/-1` (1 file) - prompt-schema alignment

Small prompt adjustment to keep output aligned to expected schema.

### 14:09 - `2498f22f` - `+528/-23` (9 files) - visual-guide shadow benchmarking + tests

You added visual-guide experimentation tooling and tests around entity image prompt generation and reference-card integration, improving determinism and observability of visual-style decisions.

### 15:37 - `95e778ee` - `+779/-375` (15 files) - remove rolling summary step, gate mapping on rewrite output

This is a structural pipeline simplification. You removed an older rolling summary path, gated chapter mapping on rewritten output readiness, updated scheduler/progress behavior, and replaced legacy summary tooling with a more explicit chapter-by-chapter-with-paragraphs flow and tests.

### 15:41 - `bd1e3cea` - `+140/-50` (3 files) - queue Gemini/Vertex calls for chapter summary mapping

You introduced `chapter-summary-llm-queue.ts` to control provider concurrency and improve throughput while preserving stability under provider limits.

### 15:42 - `9fb7824c` - `+501/-7` (2 files) - merge small SE divider sections into adjacent chapters

SE converter logic now merges tiny structural divider sections, reducing chapter fragmentation and improving downstream chapter-level processing consistency.

### 17:18 - `2ab46996` - `+650/-0` (2 files) - benchmark context bundle collector

You added a dedicated collector to package benchmark context artifacts. This is critical for experiment reproducibility and model-output audits.

### 18:35 - `03421c2e` - `+428/-211` (5 files) - reuse visual guides + harden XML coverage

This commit tightened visual-guide reuse and expanded XML-focused handling in summary/generation paths, reducing duplication and parser fragility.

### 20:05 - `bb3b4222` - `+5/-665` (7 files) - remove deprecated metadata tooling

You removed dead/legacy metadata generation scripts and stale prompt/files, reducing maintenance surface and accidental usage risk.

### 20:22 - `1c0fa41d` - `+700/-8` (23 files) - character role + spoiler-cleanup metadata flow (pipeline + convex + player)

This commit built an end-to-end metadata enrichment stage: role generation and spoiler cleanup became first-class pipeline outputs, then propagated through Convex schema/query/generator changes to the player UI (character captions/cards). Tests were added across pipeline and data layers, indicating production-intent depth.

Simplified stage concept:

```ts
const cleaned = await generateRolesAndSpoilerSafeSummaries(rawCharacterSummaries);
await saveCharacterMetadata(cleaned); // Convex
renderCharacterCard(cleaned.role, cleaned.summary); // Player
```

### 20:37 - `494571f4` - `+33/-4` (4 files) - remove parenthetical aliases in character display names

You tightened display formatting by stripping alias suffixes from visible character names and added tests around caption formatting. Small change, immediate UX clarity gain.

---

## 2026-02-08 (Sat) - 9 commits, +2,489 / -1,089

### 08:53 - `689e9166` - `+0/-301` (1 file) - remove old data file

You deleted stale JSON artifact (`single-summary-per-person.json`), reducing risk of accidental dependency on outdated benchmark/input material.

### 09:18 - `b7190145` - `+647/-191` (9 files) - slug-first cleanup + retroactive role backfill

You made role-cleanup processing more robust and introduced a retroactive backfill path for already-processed books. This is exactly the kind of migration capability needed when metadata semantics evolve after initial ingestion.

### 10:06 - `f58eca8c` - `+2/-1` (1 file) - improved spoiler/role prompt

Prompt refinement tuned role extraction and spoiler redaction behavior.

### 10:06 - `8661f3db` - `+6/-0` (1 file) - default code settings

Environment defaults were updated in Codex settings; operational quality-of-life change.

### 11:45 - `7075968e` - `+389/-51` (6 files) - generate music covers with style matching

You added an end-to-end script to generate abstract audio cover art by combining model analysis/generation plus media post-processing and metadata import integration. Supporting fixes were included for MIME mapping and upload hooks.

### 12:15 - `6597a280` - `+7/-5` (1 file) - queue background prompt Gemini calls

You tuned background prompt generation to use queued provider calls for better throughput/rate-limit behavior.

### 13:31 - `66c3f4d6` - `+200/-11` (3 files) - letter-avatar and reading-progress smoothing

You improved avatar normalization behavior and refined chapter/book progress calculations in the reader. Added tests around normalizer behavior to lock in correctness.

### 14:43 - `5175c86c` - `+764/-393` (22 files) - pipeline flow updates + player transition polish

This commit combined pipeline operations and frontend polish:

- Pipeline: `continue-pipeline-cli` refactor, `--only-step` support, dependency validation for single-step execution, queue-runner integration, broader scheduler correctness.
- Generation behavior: FREE_RUN handling and background-style routing improvements.
- Platform: feature-gated nav/footer/search behavior for launched-vs-hidden library.
- Player: substantial graphics controls (image/video overlay opacity, edge fade, zoom speed), smoother spacer/gradient transitions, blur animation updates, modal flow improvements.

Simplified dependency gate added in this family:

```ts
if (onlyStep) {
  const missing = getMissingStepDeps(onlyStep, completedSteps);
  if (missing.length) throw new Error(`Missing deps: ${missing.join(", ")}`);
}
```

### 18:20 - `733b9d93` - `+474/-136` (7 files) - embeddings safety-net + integration coverage

You refactored paragraph embedding creation to separate side effects from orchestration logic, then added unit + integration specs and supporting cache/mtime utilities. This increases confidence in answer-server embedding correctness and reduces regression risk.

Simplified separation pattern:

```ts
// orchestration
const paragraphs = await loadParagraphs(chapter);
const vectors = await createEmbeddings(paragraphs);
await persistEmbeddingSideEffects(vectors); // isolated/testable
```

---

## Branch vs Main Clarification

- `main` commits in this period (authored by you): `2`
  - `eb36d71b` (Convex upgrade)
  - `84ef3420` (merge commit)
- Unique commits on current branch since Feb 3: the remaining `38`
- There were no "main-only" authored commits in this window that were missing from your current branch.

---

## Architecture + Functionality Matrix (Per Commit)

This section makes the split explicit for investor/technical review:

- `Architecture` = system design, data flow, reliability, maintainability.
- `Functionality` = user/operator-visible behavior change.

### 2026-02-04

#### `eb36d71b` - update convex to 1.31.5 across packages
Architecture: unified Convex dependency baseline across apps and lockfile.
Functionality: reduced cross-app/version mismatch risk during runtime and deploy.

#### `84ef3420` - merge pull request #9
Architecture: integrated Convex upgrade baseline into `main` history.
Functionality: enabled subsequent feature work to run on one consistent dependency graph.

#### `d6aba0f5` - paragraph counts. restore unwrapped and other fixes
Architecture: introduced a large repair/tooling layer for malformed chapters and added paragraph-count backfill infrastructure plus test coverage.
Functionality: improved chapter text correctness in pipeline output and downstream player rendering (fewer broken structures/tags).

### 2026-02-05

#### `d1f35dbc` - adding the wrapping/restoring unwrapped
Architecture: formalized section-wrapper guarantees around restoration flow.
Functionality: fewer malformed section boundaries in rewritten chapters.

#### `2f18f5ce` - free-run mode, raw LLM capture, generic avatar fallback, SE search
Architecture: added alternate pipeline execution mode and cleaner fallback handling for image generation.
Functionality: operators can run faster experimental passes; end users see fallback avatars instead of missing visuals.

#### `c93d7128` - zooming on images, html edit in convex, pipeline improvements
Architecture: added modal/store wiring for zoom and expanded pipeline CLI/tooling paths.
Functionality: users can zoom illustrations in-reader; operators gained new upload/edit flow capabilities.

#### `f05340f3` - prevent gemini timing out
Architecture: simplified/tuned Gemini call behavior to be timeout-resistant.
Functionality: fewer pipeline failures caused by long/fragile model calls.

### 2026-02-06

#### `b9a4aa1f` - standard ebooks automation wave
Architecture: introduced SE queueing, notes import, drama classification, and converter/test expansions.
Functionality: much broader, automatable ingestion of Standard Ebooks catalog into product surfaces.

#### `c41dba0c` - platform carousel UX and library performance
Architecture: added new library/feature components and monitoring hook for frontend perf.
Functionality: faster-feeling browse flow and improved discoverability in platform library UI.

#### `6491d121` - remove useless noisy log
Architecture: cleaned noisy instrumentation in media activation path.
Functionality: cleaner runtime diagnostics for development and incident triage.

#### `e5df4b1a` - checkpoint for automated pipeline improvements
Architecture: added robust Gemini rate-limit detection, retry-delay parsing, Vertex fallback, and abort-aware scheduling.
Functionality: long-running pipeline jobs fail less often and cancel more safely.

#### `a98284cc` - platform library section improvements and pipeline stability
Architecture: introduced mtime-aware caching, queue-runner/upload scripts, and rewritten-text coverage verification.
Functionality: faster repeated processing and more reliable catalog/cover rollout with clearer quality checks.

#### `cf35d3e9` - improvement for chapter dynamic loading
Architecture: added virtualization window logic to loading pipeline.
Functionality: smoother reading through large books with fewer loading artifacts.

#### `b21d7ea6` - missing metadata uploaded
Architecture: imported large static metadata datasets into repo.
Functionality: library can render categories/book cards directly from shipped data.

#### `a1403061` - descriptions also needed for deployment
Architecture: completed deployment data bundle with description payloads.
Functionality: richer book cards/search hooks available at runtime.

### 2026-02-07

#### `5e78b167` - genai upgrade + thinking + typography preservation
Architecture: upgraded model SDK and tuned structured-generation settings.
Functionality: better summary/reference quality and preserved literary punctuation in output.

#### `b1666640` - chunk rewrite continuity and tests
Architecture: strengthened chunk rewrite strategy with substantial specs.
Functionality: less abrupt style/content drift between adjacent rewritten chunks.

#### `38776894` - queued rewrite orchestrator with benchmark artifacts
Architecture: introduced orchestrator abstraction and benchmark-reporting pipeline.
Functionality: operators can run and compare rewrite strategies more predictably.

#### `53c50416` - apply current callO3 updates
Architecture: refreshed provider wrapper behavior.
Functionality: improved compatibility of model invocation layer.

#### `f1ea823c` - callO3 changed to gpt5
Architecture: normalized provider naming/wiring from O3 path to GPT-5 path.
Functionality: rewrite/reference-card flows now call intended model entrypoints consistently.

#### `95025b40` - benchmark reference cards with gpt5+gemini
Architecture: added model comparison harness and large test expansion for reference-card generation.
Functionality: more measurable control over card quality/cost tradeoffs.

#### `3dd233bb` - tweak prompt to align with schema
Architecture: tightened prompt-template contract with schema parser expectations.
Functionality: fewer schema-shape mismatches in generated output.

#### `2498f22f` - visual-guide shadow benchmarking and coverage tests
Architecture: added visual-guide experiment framework and image-prompt test coverage.
Functionality: more stable character/visual reference generation.

#### `95e778ee` - remove rolling summary step and gate mapping on rewrite output
Architecture: simplified summary pipeline by removing redundant stage and enforcing rewrite-gated mapping.
Functionality: chapter summaries/maps align better with final rewritten text.

#### `bd1e3cea` - queue Gemini and Vertex calls for summary mapping
Architecture: introduced LLM queue module for chapter-summary mapping calls.
Functionality: improved throughput and fewer provider-overload incidents.

#### `9fb7824c` - merge small structural SE divider sections
Architecture: changed SE converter chapter segmentation logic.
Functionality: cleaner chapter boundaries and less fragmentation for downstream UI/pipeline stages.

#### `2ab46996` - benchmark context bundle collector
Architecture: added artifact collector for reproducible benchmark context snapshots.
Functionality: easier run-to-run comparisons and debugging of model behavior.

#### `03421c2e` - reuse reference visual guides and harden xml coverage
Architecture: reduced duplication in visual-guide usage and extended XML handling paths/tests.
Functionality: fewer generation inconsistencies and parser edge-case failures.

#### `bb3b4222` - remove deprecated metadata tooling
Architecture: deleted obsolete metadata scripts and stale supporting files.
Functionality: lower accidental use of unsupported pipelines.

#### `1c0fa41d` - character role + spoiler-cleanup metadata flow
Architecture: added full metadata-processing stage and propagated schema/query changes through Convex + player.
Functionality: character cards/captions now expose cleaner role-aware, spoiler-reduced metadata.

#### `494571f4` - strip parenthetical aliases from display names
Architecture: tightened character caption formatting logic and tests.
Functionality: cleaner, more readable character names in UI.

### 2026-02-08

#### `689e9166` - remove old data file
Architecture: removed stale benchmark/data artifact from active tree.
Functionality: reduced risk of outdated data influencing results.

#### `b7190145` - slug-first cleanup and retroactive role backfill
Architecture: introduced retroactive metadata cleanup/backfill tooling and stronger role-cleanup logic.
Functionality: previously processed books can be upgraded to newer metadata quality without full reprocessing.

#### `f58eca8c` - improved prompt for removing spoilers and creating roles
Architecture: refined role/spoiler prompt contract.
Functionality: cleaner summaries with better spoiler suppression.

#### `8661f3db` - default code settings
Architecture: updated local code-assistant environment defaults.
Functionality: more consistent coding environment behavior for ongoing work.

#### `7075968e` - generate-music-covers with style-matched cover art
Architecture: added media-cover generation pipeline (analysis -> image gen/edit -> resize/embed -> metadata import).
Functionality: generated MP3 tracks gain style-aligned cover art and improved metadata handling.

#### `6597a280` - queue background prompt Gemini calls
Architecture: moved background prompt generation to queued provider invocation.
Functionality: steadier background generation under load/rate limits.

#### `66c3f4d6` - fix letter avatars and smooth chapter/book progress
Architecture: adjusted normalization and reading-progress logic with tests.
Functionality: better avatar fallback behavior and smoother progress indicators for readers.

#### `5175c86c` - update pipeline flow and polish player transitions
Architecture: expanded pipeline step controls (`--only-step`, dependency checks), improved scheduler/runner orchestration, and revised graphics settings plumbing.
Functionality: operators can resume/run targeted stages safely; readers get finer visual controls and smoother transitions.

#### `733b9d93` - embeddings safety-net and integration coverage
Architecture: split embedding side effects from orchestration and added unit/integration safety net.
Functionality: answer-server embedding generation is more reliable and regression-resistant.

---

## Suggested Render Path (Markdown -> HTML)

If you want a shareable HTML artifact for investor updates:

```bash
bunx marked docs/reports/engineering-report-2026-02-03-to-2026-02-08.md > /tmp/engineering-report.html
open /tmp/engineering-report.html
```

If you want, I can also generate a styled HTML version (with typography, section TOC, and print/PDF-ready CSS) directly in the repo.
