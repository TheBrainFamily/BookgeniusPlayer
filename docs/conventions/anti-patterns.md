# Anti-Patterns

Patterns to avoid in this codebase.

## Type Safety

| Avoid              | Why                   | Do Instead                   |
| ------------------ | --------------------- | ---------------------------- |
| `as any`           | Defeats type checking | Fix the actual type          |
| `@ts-ignore`       | Hides real errors     | Address the underlying issue |
| `@ts-expect-error` | Same as above         | Fix the type properly        |

## Dependencies

| Avoid            | Why                     | Do Instead             |
| ---------------- | ----------------------- | ---------------------- |
| `dotenv`         | Bun auto-loads `.env`   | Just use `process.env` |
| `express`        | Bun has built-in server | Use `Bun.serve()`      |
| `ws`             | Built into Bun          | Use native `WebSocket` |
| `ioredis`        | Bun has Redis client    | Use `Bun.redis`        |
| `ts-node`        | Slow startup            | Use `tsx` or `bun`     |
| `better-sqlite3` | Bun has SQLite          | Use `bun:sqlite`       |
| `node:fs`        | Platform inconsistency  | Use `Bun.file`         |

## Convex

| Avoid                        | Why                  | Do Instead            |
| ---------------------------- | -------------------- | --------------------- |
| Editing `convex/_generated/` | Auto-generated files | Let Convex regenerate |
