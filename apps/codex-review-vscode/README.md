# Codex Review Guide

VS Code extension + CLI for guided, chunk-level review of your current working tree changes.

## What It Does

- Generates `.codex-review/review-plan.json` from `git diff HEAD` hunks (+ untracked text files)
- Exports `.tours/review-<sessionId>.tour` for CodeTour-style step playback
- Stores decisions in `.codex-review/review-state.json` with `accept` / `reject` / `unreviewed`
- Enforces completion only when all chunks are labeled

## CLI

Default one-command start (baseline + seed + editable story files):

```bash
bun run codex-review-vscode
```

Equivalent direct command (`start` is an alias of `generate`):

```bash
bun run apps/codex-review-vscode/src/cli.ts start --workspace .
```

This generates all of:

- `.codex-review/review-plan.json`
- `.codex-review/review-state.json`
- `.tours/review-<sessionId>.tour`
- `.codex-review/story-seed.json`
- `.codex-review/story-steps.json`
- `.codex-review/chunk-narrations.json`
- `.codex-review/session-lock.json`
- `.codex-review/agent-brief.txt`

For large changesets, CLI prints only an initial preview and a `narration-list` command for the next page.
`start` also suggests an initial interactive batch of ~5 chunks, then you can keep calling `next-batch`.

Scope review to selected files/paths (repeatable):

```bash
bun --filter codex-review-vscode generate --include-file apps/player/src/main.ts --include-path apps/player
```

You can also pass `--include=path/to/file.ts` as shorthand for file include.

Create seed/templates separately (granular mode):

```bash
bun --filter codex-review-vscode create-story-seed
```

Apply authored split files (default path autodetect also works):

```bash
bun run apps/codex-review-vscode/src/cli.ts apply-story --workspace . --steps-file .codex-review/story-steps.json --narration-file .codex-review/chunk-narrations.json
```

List pending narration chunks page-by-page (with optional scope):

```bash
bun run apps/codex-review-vscode/src/cli.ts narration-list --workspace . --limit 10 --offset 0 --include-path apps/player
```

Alias forms also work:

```bash
bun run apps/codex-review-vscode/src/cli.ts chunks --workspace . --file apps/player/src/main.ts --limit 10
bun run apps/codex-review-vscode/src/cli.ts narration list --workspace . --path apps/player --limit 10
```

Set narration and optionally append a manual story step for specific chunk IDs:

```bash
bun run apps/codex-review-vscode/src/cli.ts narration-set-chunks --workspace . --payload '{"ids":["chunk-abc","chunk-def"],"explanation":"What changed","reasoning":"Why this was done","level":"mid","title":"Runtime behavior","why":"Review this thread end-to-end"}'
```

Alias forms also work:

```bash
bun run apps/codex-review-vscode/src/cli.ts set --workspace . --payload '{"ids":["chunk-abc"],"explanation":"...","reasoning":"..."}'
bun run apps/codex-review-vscode/src/cli.ts narration setChunks --workspace . --payload '{"ids":["chunk-abc"],"explanation":"...","reasoning":"..."}'
```

Check current session health and pending files:

```bash
bun run apps/codex-review-vscode/src/cli.ts status --workspace . --limit 20
```

`status` also reports viewed chunks (`last opened`) so the agent can align with what the user is currently reviewing.

Continue interactive batches:

```bash
bun run apps/codex-review-vscode/src/cli.ts next-batch --workspace .
# alias:
bun run apps/codex-review-vscode/src/cli.ts continue --workspace .
```

Each narration command prints authored/remaining progress so an agent can iterate until done.

Apply an agent-authored single story file:

```bash
bun run apps/codex-review-vscode/src/cli.ts apply-story --workspace . --story-file .codex-review/story.json
```

One-shot generation with an existing story file:

```bash
bun run apps/codex-review-vscode/src/cli.ts generate --workspace . --story-file .codex-review/story.json
```

Optional notes override:

```bash
bun run apps/codex-review-vscode/src/cli.ts generate --workspace . --notes .codex-review/author-notes.json
```

## Agent Handoff

1. Run `bun run codex-review-vscode`
2. Give `.codex-review/agent-brief.txt` to the authoring agent.
3. It can call `status`, `chunks`, and `narration setChunks` iteratively.
4. Run `bun run apps/codex-review-vscode/src/cli.ts apply-story --workspace .`.

## Extension Commands

- `Codex Review: Generate Session`
- `Codex Review: Load Session`
- `Codex Review: Open Step`
- `Codex Review: Open Chunk`
- `Codex Review: Accept Chunk`
- `Codex Review: Reject Chunk`
- `Codex Review: Next Unreviewed Chunk`
- `Codex Review: Show Progress`
- `Codex Review: Complete Review`

## Local Status Files

- `.codex-review/review-plan.json`
- `.codex-review/review-state.json`
- `.codex-review/session-lock.json`
- `.codex-review/agent-brief.txt`
- `.tours/review-<sessionId>.tour`

Add these to `.gitignore` if you do not want to commit session artifacts.
