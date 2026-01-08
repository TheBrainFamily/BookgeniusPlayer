# BookGenius - Project Context

Interactive audiobook platform with AI-powered content. Monorepo with React apps + Convex backend.

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
- Standard Ebooks data: `apps/pipeline/standardebooks-data/`
- Detailed docs: `AGENTS.md`, `CODEBASE_GUIDE.md`

## Git Rules

- **NEVER force push** (`git push --force`, `git push -f`, `git push --force-with-lease`)
- Always use regular `git push` for pushing commits
