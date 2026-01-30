# BookGenius

Interactive ebook reader platform transforming public domain books into immersive experiences with AI-generated avatars, scenes, music, and voice Q&A.

## Essentials

- **Runtime**: Bun (not Node/npm)
- **Backend**: Convex (`bun convex dev`)
- **Quality**: `bun run typecheck && bun run lint`

## Structure

```
apps/
├── player/         # Book reader (Vite + React)
├── bookgenius-cms/ # Admin CMS (Next.js 15)
├── pipeline/       # AI book processing
├── platform/       # Landing + auth
└── pipeline-ui/    # Pipeline interface
convex/             # Backend functions + schema
```

## Documentation

| Topic              | File                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| TypeScript & style | [docs/conventions/typescript.md](docs/conventions/typescript.md)           |
| Convex patterns    | [docs/conventions/convex-patterns.md](docs/conventions/convex-patterns.md) |
| Anti-patterns      | [docs/conventions/anti-patterns.md](docs/conventions/anti-patterns.md)     |
| Codebase map       | [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md)                               |

## App-Specific Guides

- [apps/player/AGENTS.md](apps/player/AGENTS.md) - Virtualized reader, media sync
- [apps/bookgenius-cms/AGENTS.md](apps/bookgenius-cms/AGENTS.md) - Admin interface
- [apps/pipeline/AGENTS.md](apps/pipeline/AGENTS.md) - Book processing pipeline
- [convex/AGENTS.md](convex/AGENTS.md) - Backend schema and queries
