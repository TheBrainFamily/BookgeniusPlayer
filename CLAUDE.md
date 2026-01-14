# BookGenius - Project Context

Interactive ebook reader platform that transforms public domain books into immersive reading experiences with AI-generated character avatars, background scenes, music cues, and voice/text Q&A.

## Architecture Overview

**Monorepo** with 6 apps + Convex backend:

- **Player** (`apps/player/`) - Core book reader with virtualized scrolling, audio crossfader, and OpenAI Realtime voice Q&A
- **CMS** (`apps/bookgenius-cms/`) - Next.js 15 admin for managing books, characters, chapters, and cues
- **Pipeline** (`apps/pipeline/`) - AI-powered book processing (Gemini/Claude/GPT for character extraction, avatar generation, embeddings)
- **Platform** (`apps/platform/`) - Landing page with Clerk/Snapplify auth
- **Pipeline UI** (`apps/pipeline-ui/`) - Visual interface for pipeline operations
- **Player Native** (`apps/player-native/`) - React Native mobile wrapper

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Quick Reference

| App                   | Purpose                    | Dev Command                               |
| --------------------- | -------------------------- | ----------------------------------------- |
| `apps/player`         | Book reader (React + Vite) | `bun run dev:player`                      |
| `apps/bookgenius-cms` | Admin CMS (Next.js)        | `cd apps/bookgenius-cms && bun dev`       |
| `apps/pipeline`       | Book processing scripts    | `bun apps/pipeline/src/tools/<script>.ts` |
| `convex/`             | Backend                    | `npx convex dev`                          |

## Tech Stack

- **Runtime**: Bun (not Node)
- **Frontend**: React 19, TypeScript 5.8.2
- **Backend**: Convex
- **Style**: Semicolons, camelCase, Prettier (printWidth: 100)

## Commands

```bash
bun run typecheck        # Type check all
bun run lint             # Lint all
```

## Standard Ebooks Sync

```bash
bun apps/pipeline/src/tools/syncNewStandardEbooks.ts    # Download new books
bun apps/pipeline/src/tools/generateSEDescriptions.ts   # Generate descriptions
```

## Key Locations

- Book reader logic: `apps/player/src/hooks/`, `apps/player/src/services/`
- Backend queries: `convex/bookQueries.ts`
- Asset manager: `convex/components/asset-manager/`
- Standard Ebooks data: `apps/pipeline/standardebooks-data/`
- Detailed architecture: [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md)

## Git Rules

- **NEVER force push** (`git push --force`, `git push -f`, `git push --force-with-lease`)
- Always use regular `git push` for pushing commits
