# TypeScript & Style Conventions

## TypeScript

- **Strict mode**: Enabled
- **Interfaces**: Use for all object shapes

## Naming

| Type                | Convention | Example          |
| ------------------- | ---------- | ---------------- |
| Variables/functions | camelCase  | `getUserData`    |
| Classes/interfaces  | PascalCase | `BookReader`     |
| Files               | kebab-case | `book-reader.ts` |

## Formatting

- **Prettier**: `printWidth: 100`
- **Semicolons**: Yes
- **Quotes**: Double

## Bun APIs

Prefer Bun built-ins over third-party packages:

| Instead of     | Use                   |
| -------------- | --------------------- |
| `fs.readFile`  | `Bun.file().text()`   |
| `fs.writeFile` | `Bun.write()`         |
| `express`      | `Bun.serve()`         |
| `dotenv`       | Bun auto-loads `.env` |
| `ts-node`      | `bun` directly.       |
