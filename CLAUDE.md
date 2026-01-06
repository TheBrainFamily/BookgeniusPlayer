# BookGenius - Project Context

Interactive audiobook platform with AI-powered content. Monorepo with React apps + Convex backend.

## Quick Reference

| App | Purpose | Dev Command |
|-----|---------|-------------|
| `apps/player` | Book reader (React + Vite) | `bun run dev:player` |
| `apps/bookgenius-cms` | Admin CMS (Next.js) | `cd apps/bookgenius-cms && bun dev` |
| `apps/pipeline` | Book processing scripts | `bun apps/pipeline/src/tools/<script>.ts` |
| `convex/` | Backend | `npx convex dev` |

## Tech Stack
- **Runtime**: Bun (not Node)
- **Frontend**: React 19, TypeScript 5.8.2
- **Backend**: Convex
- **Style**: No semicolons, camelCase, Prettier

## Commands
```bash
bun run typecheck        # Type check all
bun run lint             # Lint all
npx convex dev           # Start Convex (required for player/CMS)
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

## Serena MCP
This project has Serena memories. Run `mcp__serena__list_memories` to see available context about project structure, conventions, and commands.
