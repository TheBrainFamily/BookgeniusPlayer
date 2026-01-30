# Claude Agent SDK Book Processing Pipeline

## Goal

Build an agent using the Claude Agent SDK that processes Standard Ebooks chapter-by-chapter to:

1. Discover characters incrementally
2. Tag speakers (`data-speaker` attributes)
3. Tag character mentions (`<span data-c="id">` wrappers)
4. Preserve exact text content with validation

## Architecture Decision: Custom MCP Tools + Agent Orchestration

**Why this approach:**

- The SDK's `createSdkMcpServer()` and `tool()` functions allow defining custom tools that run in-process
- Agent handles high-level decisions (what to do next, retry on failures)
- Tools handle deterministic work (file I/O, chunking, validation)
- This provides reliability (testable tools) + flexibility (agent self-healing)

## Architecture: Orchestrator + Subagents (Token Efficient)

Instead of one long-running session that accumulates all context (expensive), use:

```
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (lightweight, minimal context)                │
│  - Holds: character list, chapter summaries                 │
│  - Does NOT hold: full chapter text                         │
└─────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐          ┌─────────┐          ┌─────────┐
   │ Ch 1    │          │ Ch 2    │          │ Ch N    │
   │ Subagent│          │ Subagent│          │ Subagent│
   └─────────┘          └─────────┘          └─────────┘
   Returns:             Receives:
   - new characters     - all characters so far
   - tagged XML (saved) - story summary so far
   - chapter summary    Returns same pattern...
```

**Token savings**: Each subagent starts fresh. Only passes forward:

- Character list (compact JSON)
- Rolling story summary (few paragraphs)
- NOT the full text of previous chapters

```typescript
// Orchestrator spawns subagents for each chapter
import { query } from "@anthropic-ai/claude-agent-sdk";

for (const chapter of chapters) {
  const subagentResult = await query({
    prompt: buildChapterPrompt(chapter, characters, storySummary),
    options: { maxTurns: 20, model: "sonnet", allowedTools: ["mcp__bookProcessor__*"] },
  });

  // Extract compact results
  characters = [...characters, ...subagentResult.newCharacters];
  storySummary = updateSummary(storySummary, subagentResult.chapterSummary);
  // Tagged XML already saved by subagent via WriteTaggedXml tool
}
```

## File Structure

```
apps/pipeline/src/agent/
├── book-processor.ts            # Orchestrator (TypeScript, spawns subagents)
├── chapter-subagent.ts          # Builds prompt, spawns query() for one chapter
├── prompts/
│   └── chapter-prompt.ts        # Template for subagent prompt
├── tools/
│   ├── index.ts                 # MCP server with all tools
│   ├── read-chapter.ts          # ReadChapterXml tool
│   ├── write-tagged.ts          # WriteTaggedXml tool (with validation)
│   └── checkpoint.ts            # Load/Save checkpoint
└── types.ts                     # Shared interfaces (Character, Checkpoint, etc.)
```

## Custom Tools to Implement

### 1. ReadChapterXml

- Input: `{ bookSlug, chapterNumber, chunkIndex? }`
- Reads from `standardebooks-data/books/{slug}/text/chapter-{N}.xhtml`
- Extracts content elements (`<p>`, `<blockquote>`, `<div>`, headers, etc.) as raw XML
- No transformation - just extract the body content directly
- Returns: raw XML string, token count, chunking info if chapter is large
- Reuses: existing JSDOM parsing patterns from pipeline

### 2. WriteTaggedXml

- Input: `{ bookSlug, chapterNumber, taggedXml, chunkIndex? }`
- **Validates before writing** using `compareXmlTextContent()`
- Auto-corrects small drifts with `restoreOriginalText()`
- Writes to: `books-data/{slug}/temporary-output/rewritten-paragraphs-for-chapter-{N}.xml`
- Returns: `{ success, path, validationPassed, autoCorreected, error?, diff? }`

### 3. SaveCheckpoint / LoadCheckpoint

- Stores: `{ sessionId, bookSlug, lastProcessedChapter, characters[], timestamp }`
- Path: `books-data/{slug}/temporary-output/checkpoint.json`

### 4. GetKnownCharacters

- Returns current character list for context in prompts

## Processing Flow

```
┌─────────────────────────────────────────────────┐
│  CLI: bun apps/pipeline/src/agent/book-processor-agent.ts <slug>
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  ORCHESTRATOR (TypeScript code, not an agent)
│  - Load checkpoint (characters, summaries, last chapter)
│  - For each chapter: spawn subagent with context
│  - Collect results, update checkpoint, continue
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Ch 1    │   │ Ch 2    │   │ Ch N    │
   │ Subagent│   │ Subagent│   │ Subagent│
   │         │   │ Gets:   │   │         │
   │ Fresh   │   │ chars   │   │         │
   │ context │   │ summary │   │         │
   └─────────┘   └─────────┘   └─────────┘
       │             │             │
       ▼             ▼             ▼
   Returns:      Returns:      Returns:
   - newChars    - newChars    - newChars
   - summary     - summary     - summary
   - (XML saved) - (XML saved) - (XML saved)
```

## Prompt Strategy (What each subagent receives)

Each chapter subagent is spawned with minimal context:

```
You are processing Chapter {N} of "{Book Title}".

STORY SO FAR:
{Rolling summary - 2-3 paragraphs condensing previous chapters}

KNOWN CHARACTERS:
[{ id: "sam-spade", name: "Sam Spade", summary: "Private detective..." }, ...]

THIS CHAPTER'S CONTENT:
<p>First paragraph text...</p>
<blockquote>A quoted passage...</blockquote>
<p>Another paragraph...</p>
...

YOUR TASKS:
1. DISCOVER: Identify any NEW characters not in the known list
2. TAG: Add attributes to the content:
   - data-speaker="character-id" on elements where that character speaks
   - <span data-c="character-id">Name</span> around character name mentions
3. SUMMARIZE: Write 2-3 sentences about this chapter's key events
4. PRESERVE: Keep exact text - no spelling fixes, no additions

Use WriteTaggedXml tool to save tagged output, then return:
{ newCharacters: [...], chapterSummary: "..." }
```

**Why this works:**

- Subagent gets just enough context (characters + summary) to understand who's who
- Full chapter text is only in THIS subagent's context (not accumulated)
- Returns compact data that orchestrator can pass to next chapter

## Existing Code to Reuse

| File                                            | What to Reuse                                           |
| ----------------------------------------------- | ------------------------------------------------------- |
| `src/tools/chapterChunker.ts`                   | `chunkParagraphs()`, `combineChunks()`, `countTokens()` |
| `src/tools/new-tooling/compare-chapters-xml.ts` | `compareXmlTextContent()`, `restoreOriginalText()`      |
| `src/tools/retry.ts`                            | `withRetry()` for tool-level retries                    |
| `src/logger.ts`                                 | Structured logging                                      |
| `src/helpers/filesHelpers.ts`                   | `FILE_TYPE` enum, path resolution                       |

## Dependencies to Add

```json
{ "@anthropic-ai/claude-agent-sdk": "^0.1.59" }
```

Note: The regular SDK (`@anthropic-ai/sdk` ^0.39.0) is already in pipeline, but we need the **agent SDK** for session management and MCP tools.

## Self-Healing Mechanism

1. **Tool-level validation**: `WriteTaggedXml` validates before writing
2. **Auto-correction**: Small drifts auto-fixed with `restoreOriginalText()`
3. **Progressive rechunking on failure**:
   - If validation fails after auto-correction attempt, halve the chunk size
   - Retry with smaller chunks (e.g., 8000 → 4000 → 2000 → 1000 tokens)
   - Keep reducing until validation passes (smaller context = more accurate tagging)
   - This WILL eventually work unless there's an API outage
4. **Exponential backoff for API errors**: Rate limits, timeouts, 5xx errors trigger backoff (1s → 2s → 4s → ... up to 60s)
5. **Never skip silently**: If something truly fails (API down for extended period), notify user and halt - no broken states

## Implementation Steps

### Step 1: Set up MCP server with tools

- Create `apps/pipeline/src/agent/tools/index.ts`
- Define tool schemas using Zod
- Implement `ReadChapterXml` - reads raw XHTML, returns content + token count
- Implement `WriteTaggedXml` - validates with `compareXmlTextContent()`, auto-corrects, writes

### Step 2: Implement checkpoint persistence

- `LoadCheckpoint` / `SaveCheckpoint` tools
- Stores: `{ bookSlug, lastProcessedChapter, characters[], storySummary, timestamp }`
- Orchestrator reads/writes this between subagent calls

### Step 3: Create subagent spawner

- `chapter-subagent.ts` - builds prompt from template + context
- Uses `query()` from SDK to spawn fresh agent per chapter
- Extracts structured result: `{ newCharacters, chapterSummary }`

### Step 4: Build orchestrator

- `book-processor.ts` - main CLI entry point
- Load checkpoint, determine start chapter
- Loop: spawn subagent → collect result → update state → save checkpoint
- Pure TypeScript orchestration (not an agent itself)

### Step 5: Add progressive rechunking

For large chapters that fail validation:

```
maxTokens = 8000
while (validationFails && maxTokens >= 500):
  chunks = chunkChapter(content, maxTokens)
  for each chunk:
    spawn subagent for chunk
    if (!validate(result)):
      maxTokens = maxTokens / 2  # Halve and retry entire chapter
      break
  if (allChunksValid):
    combineChunks() → success!

if (maxTokens < 500):
  notifyUser("Chapter X failed - halting")
  process.exit(1)  # Never produce broken state
```

### Step 6: Add exponential backoff for API errors

- Wrap subagent spawning in retry logic
- Rate limits, 5xx → backoff (1s, 2s, 4s, ... up to 60s)
- Reuse existing `withRetry()` utility

## Verification Plan

1. **Unit test tools** in isolation (mock file system)
2. **Test on a short book** (e.g., Khalil Gibran's "The Forerunner" - 25 short chapters)
3. **Verify validation** works by intentionally corrupting output
4. **Test resume** by killing process mid-book and restarting
5. **Compare output** to existing pipeline results for same book

## Critical Files

- `apps/pipeline/src/tools/chapterChunker.ts` - chunking logic
- `apps/pipeline/src/tools/new-tooling/compare-chapters-xml.ts` - validation
- `apps/pipeline/src/tools/retry.ts` - retry utility
- `apps/pipeline/standardebooks-data/books/` - input source
- `apps/pipeline/books-data/` - output destination
