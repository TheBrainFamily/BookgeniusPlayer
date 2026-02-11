# Let Me Explain

VS Code extension + CLI for guided, chunk-level review of your current working tree changes.

## What It Does

- Generates `.let-me-explain/review-plan.json` from `git diff HEAD` hunks (+ untracked text files)
- Exports `.tours/review-<sessionId>.tour` for CodeTour-style step playback
- Stores decisions in `.let-me-explain/review-state.json` with `accept` / `reject` / `unreviewed`
- Enforces completion only when all chunks are labeled

## CLI

Default one-command start (baseline + seed + editable story files):

```bash
bun run let-me-explain
```

Equivalent direct command (`start` is an alias of `generate`):

```bash
bun run apps/let-me-explain/src/cli.ts start --workspace .
```

This generates all of:

- `.let-me-explain/review-plan.json`
- `.let-me-explain/review-state.json`
- `.tours/review-<sessionId>.tour`
- `.let-me-explain/story-seed.json`
- `.let-me-explain/story-steps.json`
- `.let-me-explain/chunk-narrations.json`
- `.let-me-explain/session-lock.json`
- `.let-me-explain/agent-brief.txt`

For large changesets, CLI prints only an initial preview and a `narration-list` command for the next page.
`start` also suggests an initial interactive batch of ~5 chunks, then you can keep calling `next-batch`.

Scope review to selected files/paths (repeatable):

```bash
bun --filter let-me-explain generate --include-file apps/player/src/main.ts --include-path apps/player
```

You can also pass `--include=path/to/file.ts` as shorthand for file include.

Create seed/templates separately (granular mode):

```bash
bun --filter let-me-explain create-story-seed
```

Apply authored split files (default path autodetect also works):

```bash
bun run apps/let-me-explain/src/cli.ts apply-story --workspace . --steps-file .let-me-explain/story-steps.json --narration-file .let-me-explain/chunk-narrations.json
```

List pending narration chunks page-by-page (with optional scope):

```bash
bun run apps/let-me-explain/src/cli.ts narration-list --workspace . --limit 10 --offset 0 --include-path apps/player
```

Alias forms also work:

```bash
bun run apps/let-me-explain/src/cli.ts chunks --workspace . --file apps/player/src/main.ts --limit 10
bun run apps/let-me-explain/src/cli.ts narration list --workspace . --path apps/player --limit 10
```

Set narration and optionally append a manual story step for specific chunk IDs:

```bash
bun run apps/let-me-explain/src/cli.ts narration-set-chunks --workspace . --payload '{"ids":["chunk-abc","chunk-def"],"explanation":"What changed","reasoning":"Why this was done","level":"mid","title":"Runtime behavior","why":"Review this thread end-to-end"}'
```

Alias forms also work:

```bash
bun run apps/let-me-explain/src/cli.ts set --workspace . --payload '{"ids":["chunk-abc"],"explanation":"...","reasoning":"..."}'
bun run apps/let-me-explain/src/cli.ts narration setChunks --workspace . --payload '{"ids":["chunk-abc"],"explanation":"...","reasoning":"..."}'
```

Check current session health and pending files:

```bash
bun run apps/let-me-explain/src/cli.ts status --workspace . --limit 20
```

`status` also reports viewed chunks (`last opened`) so the agent can align with what the user is currently reviewing.

Continue interactive batches:

```bash
bun run apps/let-me-explain/src/cli.ts next-batch --workspace .
# alias:
bun run apps/let-me-explain/src/cli.ts continue --workspace .
```

Each narration command prints authored/remaining progress so an agent can iterate until done.

Apply an agent-authored single story file:

```bash
bun run apps/let-me-explain/src/cli.ts apply-story --workspace . --story-file .let-me-explain/story.json
```

One-shot generation with an existing story file:

```bash
bun run apps/let-me-explain/src/cli.ts generate --workspace . --story-file .let-me-explain/story.json
```

Optional notes override:

```bash
bun run apps/let-me-explain/src/cli.ts generate --workspace . --notes .let-me-explain/author-notes.json
```

## Agent Handoff

1. Run `bun run let-me-explain`
2. Give `.let-me-explain/agent-brief.txt` to the authoring agent.
3. It can call `status`, `chunks`, and `narration setChunks` iteratively.
4. Run `bun run apps/let-me-explain/src/cli.ts apply-story --workspace .`.

## Extension Commands

- `Let Me Explain: Generate Session`
- `Let Me Explain: Load Session`
- `Let Me Explain: Open Step`
- `Let Me Explain: Open Chunk`
- `Let Me Explain: Accept Chunk`
- `Let Me Explain: Reject Chunk`
- `Let Me Explain: Next Unreviewed Chunk`
- `Let Me Explain: Show Progress`
- `Let Me Explain: Complete Review`

## Local Status Files

- `.let-me-explain/review-plan.json`
- `.let-me-explain/review-state.json`
- `.let-me-explain/session-lock.json`
- `.let-me-explain/agent-brief.txt`
- `.tours/review-<sessionId>.tour`

Add these to `.gitignore` if you do not want to commit session artifacts.
