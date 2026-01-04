# BACKEND SOURCE - TOOLING & SERVICES

Core utilities for AI model calling, book file management, and pipeline step implementations.

## STRUCTURE

```
src/
├── call*.ts              # AI model wrappers
├── logger.ts             # Pino-based logging with colors
├── types.ts              # Shared TypeScript types
├── schemes.ts            # Zod schemas for AI responses
├── helpers/              # Book file I/O utilities
├── tools/                # Pipeline step implementations
│   ├── fb2-converter/    # FB2 → rich.xml conversion (core!)
│   ├── new-tooling/      # Main pipeline tools
│   └── generate-book-cli/  # Interactive book generation
├── services/             # Standalone services
│   ├── answer-server/    # Semantic search server (deployed)
│   └── upload-books-to-r2.ts
└── shared-books-data/    # Book metadata utilities
```

## AI MODEL WRAPPERS

All wrappers follow the same interface pattern:

```typescript
async function callModel<T>(
  prompt: string,
  schema?: z.ZodSchema<T>, // Optional: returns parsed JSON
  maxRetries?: number, // Default: 5 with exponential backoff
): Promise<T | string>;
```

| File                           | Model           | Features                                 |
| ------------------------------ | --------------- | ---------------------------------------- |
| `callClaude.ts`                | Claude Opus 4.5 | Thinking tokens (10K default), streaming |
| `callFastGemini.ts`            | Gemini 3 Flash  | Thinking mode, schema parsing            |
| `callGemini.ts`                | Gemini          | Simple wrapper around callFastGemini     |
| `callChatGPT.ts`               | GPT-5           | Structured output, reasoning             |
| `callO3.ts`                    | OpenAI O3       | Advanced reasoning                       |
| `callGrok.ts`                  | Grok 4.1        | Via OpenRouter                           |
| `callSonet45.ts`               | Claude Opus 4.5 | Alternative interface                    |
| `callGeminiFlashWithSentry.ts` | Kimi K2         | Via OpenRouter                           |

**Fallback chain**: `callClaude` → `callGemini` (if `useGemini=true`)

## HELPERS (`helpers/`)

| File                         | Purpose                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `getCurrentBook.ts`          | Get/set current book from `process.argv[2]`               |
| `resolveBookDir.ts`          | Resolve book directory path                               |
| `readBookFile.ts`            | Read from input/output/temporary-output                   |
| `writeBookFile.ts`           | Write to input/output/temporary-output                    |
| `filesHelpers.ts`            | File type enum, path resolution                           |
| `getBookSettings.ts`         | Read bookSettings.json                                    |
| `createBookSettings.ts`      | Generate initial settings                                 |
| `generateTagName.ts`         | Convert name → XML tag (e.g., "John Smith" → "JohnSmith") |
| `getChaptersUpTo.ts`         | Get chapter content up to N                               |
| `getHighestChapterNumber.ts` | Find max chapter in book                                  |

**File types** (`FILE_TYPE` enum):

- `INPUT` → `books-data/{slug}/input/`
- `PERMANENT` → `books-data/{slug}/output/`
- `TEMPORARY` → `books-data/{slug}/temporary-output/`

## TOOLS - PIPELINE STEPS (`tools/new-tooling/`)

| File                                                     | Pipeline Step               | What It Does                                         |
| -------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| `get-reference-cards-for-whole-book.ts`                  | generate_reference_cards    | LLM reads entire book, generates character summaries |
| `character-metadata-simple.ts`                           | (orchestrator)              | Main entry point for manual pipeline runs            |
| `create-graphical-style.ts`                              | generate_graphical_style    | LLM generates visual style JSON                      |
| `generate-prompts-for-backgrounds.ts`                    | generate_backgrounds        | Generate background images                           |
| `generate-pictures-for-entities.ts`                      | generate_entity_pictures    | Generate character avatars                           |
| `get-chapter-by-chapter-summary.ts`                      | make_chapter_summaries      | Rolling chapter summaries                            |
| `get-chapter-by-chapter-with-paragraphs-json-summary.ts` | map_summaries_to_paragraphs | Bullet points → paragraphs                           |
| `generate-intro-summary-simple.ts`                       | (post-process)              | First-person character intros                        |
| `create-reference-cards-based-on-summaries.ts`           | (alt)                       | Generate cards from summaries                        |

### Other Tools

| File                                 | Purpose                              |
| ------------------------------------ | ------------------------------------ |
| `compare-chapters-xml.ts`            | Diff two chapter XMLs                |
| `extract-wolnelektury-notes.ts`      | Extract footnotes from Wolne Lektury |
| `generate-chapters-xml-from-rich.ts` | Convert rich.xml → chapter files     |
| `generate-flux-schnel-image.ts`      | Generate images via Flux             |
| `restore-text-in-html.ts`            | Fix text encoding issues             |

## TOOLS - FB2 CONVERTER (`tools/fb2-converter/`)

**Core pipeline component** - converts FB2 format to rich.xml:

```bash
# Direct usage
tsx src/tools/fb2-converter/index.ts my-book-slug 1

# Via generate-book-cli (interactive)
bun run generate-new-book
```

| File                  | Purpose                               |
| --------------------- | ------------------------------------- |
| `index.ts`            | Entry point, `convertBook()` function |
| `fb2Converter.ts`     | FB2 XML parsing logic                 |
| `convertHtmlToXml.ts` | HTML → structured XML                 |

**Output**: `books-data/{slug}/input/rich.xml` with `<section data-chapter="N">` structure.

## TOOLS - PARAGRAPH REWRITING (`tools/`)

| File                                    | Purpose                           |
| --------------------------------------- | --------------------------------- |
| `identifyEntityAndRewriteParagraphs.ts` | Main character tag injection      |
| `chapterChunker.ts`                     | Split chapters for LLM processing |
| `pullTogetherChapters.ts`               | Assemble final chapter XMLs       |
| `*.md` (prompt files)                   | LLM prompts for rewriting         |

**Prompt variants**:

- `RewriteParagraphsPromptBook.md` - Prose format
- `RewriteParagraphsPromptPlay.md` - Play/dialogue format
- `*Chunked.md` - For long chapters

## SERVICES - ANSWER SERVER (`services/answer-server/`)

Semantic search server for book content:

```bash
bun run answer-server:build && bun build-answer-server/index.js
# or for dev
tsx src/services/answer-server/answer-server.ts
```

**Endpoints**:

- `GET /ask/stream` - SSE streaming search results
- `GET /getParagraphsForSearch` - Batch paragraph search
- `POST /deepResearch` - AI-powered deep research

**Features**:

- Google `gemini-embedding-001` for embeddings
- Cerebras `llama-3.3-70b` for query expansion
- LRU cache for book data (fetched from R2)
- Arcjet rate limiting
- CORS configured for production domains
- **Deployed** - production server running

| File                             | Purpose                      |
| -------------------------------- | ---------------------------- |
| `answer-server.ts`               | Main Bun server              |
| `ask-sse.ts`                     | SSE response handling        |
| `call-answer.ts`                 | LLM answer generation        |
| `create-paragraph-embeddings.ts` | Embedding generation         |
| `embeddingManager.ts`            | Embedding caching and lookup |
| `token.ts`                       | JWT token handling           |
| `secretKey.ts`                   | API key management           |

## SERVICES - R2 UPLOAD (`services/upload-books-to-r2.ts`)

Upload book data to Cloudflare R2:

```typescript
import { uploadBookFolder, createR2Client } from "./upload-books-to-r2";

// Upload entire book
await uploadBookFolder(bookRoot, slug);
// Uploads: embeddings.json, rich.xml

// Direct R2 access
const r2 = createR2Client();
await r2.file("path/to/file").write(content);
```

## RUNNING TOOLS MANUALLY

```bash
# Set book context
export BOOK_PATH=books-data/my-book

# Or pass as argument
tsx src/tools/new-tooling/character-metadata-simple.ts books-data/my-book

# Individual steps
tsx src/tools/new-tooling/get-reference-cards-for-whole-book.ts
tsx src/tools/new-tooling/generate-prompts-for-backgrounds.ts
tsx src/tools/new-tooling/generate-pictures-for-entities.ts
```

## PROMPTS

LLM prompts stored as markdown files:

**In `tools/`:**

- `RewriteParagraphsPromptBook.md` - Prose format rewriting
- `RewriteParagraphsPromptPlay.md` - Play/dialogue format
- `NewRewriteParagraphsPromptBook.md` - Updated prose format
- `*Chunked.md` variants - For long chapters

**In `tools/new-tooling/`:**

- `get-reference-cards-for-whole-book-prompt.md` - Character extraction
- `generate-images-prompt.md` - Image generation
- `single-summary-per-person.md` - Character summaries

## KEY PATTERNS

- **Book context**: Tools read `process.argv[2]` for book path
- **File I/O**: Always use `readBookFile`/`writeBookFile` with `FILE_TYPE`
- **Chunking**: Long chapters split for LLM context limits
- **Retry logic**: All AI calls use exponential backoff
- **Logging**: Use `logger` from `./logger.ts` (not console.log)
