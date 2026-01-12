# PROJECT KNOWLEDGE BASE

**Generated:** 2025-12-30
**Commit:** d6a29df3
**Branch:** convex-cms

## OVERVIEW

Interactive audiobook platform with AI-powered content generation. Monorepo: React apps (Vite/Next.js) + Convex backend + book processing pipeline.

## STRUCTURE

```
./
├── apps/
│   ├── player/           # Immersive book reader (MOST COMPLEX - see apps/player/AGENTS.md)
│   ├── platform/         # User-facing app (discovery, auth, payments) - Vite+React+Clerk
│   ├── bookgenius-cms/   # Admin CMS (see apps/bookgenius-cms/AGENTS.md)
│   ├── wukong/           # Platform variant (Journey to the West theme)
│   ├── editor/           # Monaco-based XML/diff viewer
│   ├── ffmpeg-worker/    # Video processing worker (Bun on Fly.io)
│   ├── webp-compressor/  # Cloudflare Worker for images
│   └── books-generator/  # Book processing scripts
├── convex/               # Backend (see convex/AGENTS.md)
│   └── components/asset-manager/  # File storage component (see its AGENTS.md)
├── backend/              # Book generation pipeline (see backend/CLAUDE.md)
├── books/                # Source book content (XML, assets)
├── compiled-books/       # Build output
└── tools/                # Monorepo scripts (deploy-s3.ts, cleanup)
```

## WHERE TO LOOK

| Task                  | Location                                   | Notes                                      |
| --------------------- | ------------------------------------------ | ------------------------------------------ |
| Add book feature      | `apps/player/src/`                         | Hooks in `hooks/`, services in `services/` |
| Backend logic         | `convex/`                                  | Queries in `bookQueries.ts`                |
| File uploads/storage  | `convex/components/asset-manager/`         | Dual R2/Convex backend                     |
| CMS admin feature     | `apps/bookgenius-cms/admin/`               | Next.js App Router                         |
| Avatar generation     | `convex/avatarGeneration.ts`               | OpenAI GPT-Image-1.5                       |
| Chapter editing       | `convex/paragraphEditor.ts`                | XML manipulation                           |
| Background/music cues | `convex/backgroundCues.ts`, `musicCues.ts` | Link assets to positions                   |
| Book import pipeline  | `backend/src/tools/`                       | Use `tsx` to run                           |
| Platform auth         | `apps/platform/`                           | Clerk integration                          |
| Media processing      | `apps/ffmpeg-worker/`                      | See its CLAUDE.md                          |

## KEY MODULES

| Module                        | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `convex/bookQueries.ts`       | Domain queries: characters, chapters, backgrounds, music |
| `convex/avatarGeneration.ts`  | AI avatar generation with WebP processing                |
| `convex/generateUploadUrl.ts` | Upload orchestration with post-upload hooks              |
| `convex/schema.ts`            | Tables: notes, variants, cues, jobs, comic submissions   |
| `apps/player/src/hooks/`      | 30+ hooks for audio, video, book state                   |
| `apps/player/src/services/`   | XML processing, scroll coordination                      |

## CONVENTIONS

- **Runtime**: `bun` not `node`/`npm`. Backend scripts: `tsx` not `ts-node`
- **TypeScript**: 5.8.2 pinned, strict typing, interfaces for all objects
- **Naming**: camelCase vars/functions, PascalCase classes/interfaces, kebab-case files
- **Imports**: External libs first, then internal modules
- **Prettier**: printWidth 180 (root), 100 (convex), 120 (backend) - NO SEMICOLONS
- **Bun APIs**: Prefer `Bun.file` over `fs`, `Bun.serve` over Express

## ANTI-PATTERNS

| Pattern                                    | Why                    | Alternative        |
| ------------------------------------------ | ---------------------- | ------------------ |
| `as any`, `@ts-ignore`, `@ts-expect-error` | Type safety            | Fix the type       |
| `dotenv`                                   | Bun auto-loads .env    | Remove dotenv      |
| Express/ws/ioredis                         | Bun has built-ins      | Use Bun APIs       |
| `ts-node`                                  | Slow                   | Use `tsx` or `bun` |
| Direct `fs` operations                     | Platform inconsistency | Use `Bun.file`     |

## UNIQUE PATTERNS

- **Asset versioning**: `avatar-large.png` → processed to `avatar.webp` via worker
- **Post-upload hooks**: `generateUploadUrl.ts` schedules background processing
- **Character bundles**: Query returns `{ avatar, speaks, listens }` assets
- **Dual storage**: R2 primary, Convex fallback - transparent to callers
- **Intent-based uploads**: `startUpload` → upload → `finishUpload` flow
- **Book forms**: "Play" (dialogue), "prose", "Mixed" - affects HTML rendering

## COMMANDS

```bash
# Development
bun run dev:player              # Player dev server
bun run dev:editor              # Editor dev server
npx convex dev                  # Convex dev server (required for player/CMS)

# Production
npx convex deploy               # Deploy Convex functions
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD) bun run ./tools/scripts/deploy-s3.ts

# Quality
bun run typecheck               # All workspaces
bun run lint                    # All workspaces
bun run prettier:check          # Check formatting

# Testing
cd convex && bun test           # Convex tests

# CLI operations (use wrapper script for admin identity)
./scripts/convex run cli:listPublishedFilesInFolder '{"folderPath": "books/BOOK/characters/SLUG"}'
./scripts/convex run admin/regenerateAvatarWebp:regenerateAvatarWebp '{"characterPath": "books/BOOK/characters/SLUG"}'
```

## DATA FLOW

```
Player Loading:
  BookConvexContext → useQuery(chapters, characters, etc.)
    → processChapters() → xmlToComplexHtml()
    → BookIndex.parse() → BookContentVirtualizer renders

Asset Upload:
  startUpload() → S3/Convex upload → finishUpload()
    → post-upload hook → background processing (WebP, previews)
```

## NOTES

- **Standalone packages**: `backend/`, `convex/`, `tools/` have own package.json (not in workspaces)
- **Generated files**: `convex/_generated/` - auto-generated, never edit
- **Book assets**: Source in `books/`, compiled in `compiled-books/`
- **CI/CD**: Daily cleanup keeps 5 versions of book assets
- **React 19**: Uses React 19.1.x with React Router v7
