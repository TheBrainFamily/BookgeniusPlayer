# Pipeline - Book Processing

AI-powered pipeline that transforms EPUB/FB2 files into interactive audiobook content with character detection, image generation, and semantic search.

## Quick Start

```bash
# Start server (port 4000)
cd apps/pipeline/server && bun start

# Run full pipeline
bun src/pipeline-cli.ts path/to/book.fb2 --slug my-book

# Resume interrupted pipeline
bun src/continue-pipeline-cli.ts books-data/my-book

# Check status
bun src/continue-pipeline-cli.ts books-data/my-book --status
```

## Pipeline Steps

| Step                          | Purpose                   | Output                           |
| ----------------------------- | ------------------------- | -------------------------------- |
| `import_epub`                 | EPUB → FB2 → rich.xml     | `input/rich.xml`                 |
| `create_settings`             | Detect language, metadata | `bookSettings.json`              |
| `upload_figures`              | Upload SE figures         | Convex `books/*/figures`         |
| `generate_reference_cards`    | Character summaries       | `single-summary-per-person.json` |
| `rewrite_paragraphs`          | Inject character tags     | `rewritten-paragraphs-*.xml`     |
| `generate_graphical_style`    | Visual style JSON         | `graphicalStyle.json`            |
| `generate_backgrounds`        | Background images         | `backgrounds/*.png`              |
| `generate_entity_pictures`    | Character avatars         | `characters/*.png`               |
| `make_chapter_summaries`      | Rolling summaries         | `summaries-*.txt`                |
| `map_summaries_to_paragraphs` | Paragraph mapping         | `bullet-points.json`             |
| `generate_embeddings`         | Semantic embeddings       | `embeddings.json`                |
| `upload_answer_server_data`   | Upload to R2              | R2 storage                       |

## Structure

```
apps/pipeline/
├── src/
│   ├── call*.ts          # AI model wrappers (Claude, Gemini, GPT)
│   ├── helpers/          # Book file I/O utilities
│   ├── tools/            # Pipeline step implementations
│   │   ├── fb2-converter/   # FB2 → rich.xml (core)
│   │   └── new-tooling/     # Main pipeline tools
│   └── services/         # Answer server, R2 uploads
├── server/               # tRPC orchestration server
└── books-data/           # Working directory for processing
```

## AI Model Wrappers

All wrappers share this interface:

```typescript
async function callModel<T>(
  prompt: string,
  schema?: z.ZodSchema<T>,
  maxRetries?: number,
): Promise<T | string>;
```

## Book Data Structure

```
books-data/{slug}/
├── input/           # Source files (fb2, rich.xml)
├── output/          # Final assets (characters/, backgrounds/)
└── temporary-output/ # Pipeline intermediates
```

## Key Patterns

- **Resumable**: Progress tracked in `pipeline-progress.json`
- **File helpers**: Use `readBookFile`/`writeBookFile` with `FILE_TYPE` enum
- **Chunking**: Long chapters split for LLM context limits
- **Convex sync**: Real-time upload via `convex-client.ts`
