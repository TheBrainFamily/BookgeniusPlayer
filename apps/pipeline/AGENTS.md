# BACKEND - BOOK GENERATION PIPELINE

AI-powered book processing pipeline that transforms EPUB/FB2 files into interactive audiobook content with character detection, image generation, and semantic search capabilities.

## STRUCTURE

```
backend/
├── src/                    # Core tooling (see src/AGENTS.md)
│   ├── call*.ts            # AI model wrappers (Claude, Gemini, GPT, Grok, O3)
│   ├── helpers/            # Book file I/O, path resolution
│   ├── tools/              # Book generation steps
│   │   ├── fb2-converter/  # FB2 → rich.xml conversion (core pipeline step)
│   │   └── new-tooling/    # Main pipeline tools
│   └── services/           # Answer server, R2 uploads
├── server/                 # tRPC pipeline server (see server/AGENTS.md)
│   └── src/
│       ├── pipeline.ts     # 11-step orchestration
│       └── router.ts       # API endpoints
├── frontend/               # Pipeline UI for importing books (see below)
├── shared/                 # Shared types (pipelineTypes.ts)
├── books-data/             # Working directory for book processing
└── .scripts/               # Import utilities (EPUB, inline images)
```

## FRONTEND UI (`frontend/`)

User-facing interface for importing books into the pipeline. Built with Vite + React + tRPC + Monaco Editor.

**Two import paths:**

1. **Upload EPUB/FB2** → Upload file → EPUB converted to FB2 via Calibre → FB2 converted to rich.xml
2. **Wolne Lektury** → Search Polish digital library → Download FB2 directly → Convert to rich.xml

**Features:**

- Drag & drop file upload
- Chapter selection/deselection before pipeline start
- Monaco editor for XML preview
- Real-time pipeline progress tracking
- Browse Wolne Lektury collections

**Run:**

```bash
cd backend/frontend && bun run dev  # Dev server
cd backend/server && tsx src/index.ts  # Backend required
```

## IMPORT FLOW

```
EPUB file ──(Calibre ebook-convert)──> FB2 file ──(fb2-converter)──> rich.xml
                                            │
Wolne Lektury ──(download FB2)──────────────┘
```

**fb2-converter** (`src/tools/fb2-converter/`): Parses FB2 XML format, extracts chapters, converts to rich.xml with `<section data-chapter="N">` structure.

## PIPELINE STEPS

| Step                           | Purpose                                   | Key Tool                                                 |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| 1. import_epub                 | Convert EPUB→FB2→rich.xml                 | `fb2-converter/`                                         |
| 2. create_settings             | Extract metadata, detect language         | `createBookSettings.ts`                                  |
| 3. generate_reference_cards    | Character summaries (no spoilers)         | `get-reference-cards-for-whole-book.ts`                  |
| 4. rewrite_paragraphs          | Inject `<Character talking="true"/>` tags | `identifyEntityAndRewriteParagraphs.ts`                  |
| 5. generate_graphical_style    | Create visual style JSON                  | `create-graphical-style.ts`                              |
| 6. generate_backgrounds        | Generate background images                | `generate-prompts-for-backgrounds.ts`                    |
| 7. generate_entity_pictures    | Character avatars (OpenAI)                | `generate-pictures-for-entities.ts`                      |
| 8. make_chapter_summaries      | Rolling chapter-by-chapter summaries      | `get-chapter-by-chapter-summary.ts`                      |
| 9. map_summaries_to_paragraphs | Bullet points → paragraph indices         | `get-chapter-by-chapter-with-paragraphs-json-summary.ts` |
| 10. generate_embeddings        | Semantic embeddings (Google)              | `create-paragraph-embeddings.ts`                         |
| 11. upload_answer_server_data  | Upload to R2                              | `upload-books-to-r2.ts`                                  |

## AI MODELS

| File             | Model           | Use Case                               |
| ---------------- | --------------- | -------------------------------------- |
| `callClaude.ts`  | Claude Opus 4.5 | Primary reasoning with thinking tokens |
| `callGemini.ts`  | Gemini 3 Flash  | Fast structured output                 |
| `callChatGPT.ts` | GPT-5           | Image generation, structured output    |
| `callO3.ts`      | OpenAI O3       | Advanced reasoning                     |
| `callGrok.ts`    | Grok 4.1        | Fast inference via OpenRouter          |
| `callSonet45.ts` | Claude Opus 4.5 | Alternative Claude interface           |

**Pattern**: All wrappers support `(prompt, schema?, maxRetries?)` with Zod validation and exponential backoff.

## COMMANDS

```bash
# Start pipeline server
cd backend/server && tsx src/index.ts

# Run pipeline from CLI
bun run pipeline:from-fb2 path/to/book.fb2 --slug my-book

# Generate new book (interactive)
bun run generate-new-book

# Import EPUB
bun run epub:import path/to/book.epub

# Run individual tool
tsx src/tools/new-tooling/character-metadata-simple.ts books-data/my-book
```

## BOOK DATA STRUCTURE

```
books-data/{slug}/
├── input/
│   ├── {slug}.fb2           # Source file
│   ├── rich.xml             # Parsed book content
│   └── bookChapters.xml     # Chapter structure
├── output/
│   ├── characters/          # Avatar images
│   ├── backgrounds/         # Background images
│   └── single-summary-per-person.json
└── temporary-output/
    ├── rewritten-paragraphs-for-chapter-{N}.xml
    ├── summaries-chapter-by-chapter-{N}.txt
    └── graphicalStyle.json
```

## KEY PATTERNS

- **Resumable Pipeline**: Progress tracked in JSON, `--from-step` to resume
- **Convex Integration**: `convex-client.ts` uploads chapters, characters, assets
- **Dual Storage**: R2 for CDN delivery, Convex for metadata
- **Character Tags**: `<CharacterName talking="true"/>` injected into XML
- **Embeddings**: Google `gemini-embedding-001` for semantic search

## ENVIRONMENT VARIABLES

```bash
ANTHROPIC_API_KEY=          # Claude
GOOGLE_API_KEY=             # Gemini
OPENAI_API_KEY=             # GPT, DALL-E
OPENROUTER_API_KEY=         # Grok, Kimi
R2_ENDPOINT=                # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
CONVEX_URL=                 # Convex backend
```

## NOTES

- **Separate from monorepo**: Has own package.json, not in workspaces
- **Runtime**: Use `tsx` for scripts, `bun` for server
- **Calibre required**: `ebook-convert` for EPUB→FB2 conversion
- **Long-running**: Full pipeline takes 30-60 minutes per book
