# Paragraph Index Migration Tools

Tools for migrating cue positions when changing paragraph extraction logic from "direct children only" to "nested paragraph extraction".

## Overview

**Problem:** Cues (backgrounds/music) reference chapter + paragraph indices. When we change how paragraphs are indexed (to handle nested structures like `<blockquote>`), existing cues will point to wrong paragraphs.

**Solution:** One-shot migration with automatic content matching and manual review.

## Workflow

### 1. Identify affected books

```bash
bun /Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/find-books-with-cues.ts
```

Shows all books with cues at paragraph > 0 (only these need migration).

### 2. Migrate one book

```bash
bun /Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/migrate-book.ts <bookSlug>
```

Example:
```bash
bun /Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/migrate-book.ts Lalka
```

This will:
- ✅ Snapshot cues to `backups/{slug}-{timestamp}.json`
- ✅ Extract old and new paragraph indices
- ✅ Auto-match indices by content similarity
- ✅ Save migration plan to `plans/{slug}-{timestamp}.json`

### 3. Review mappings (interactive CLI)

```bash
bun /Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/review-mappings-cli.ts <planPath>
```

Shows:
- Old index → New index mappings
- Content preview for verification
- Affected cues at each position
- Confidence level (exact/fuzzy/manual)

You can:
- ✅ Approve exact matches automatically
- 🔍 Review fuzzy matches manually
- ✋ Reject mappings that need adjustment

### 4. Apply migration (TODO)

```bash
bun /Users/lukaszgandecki/projects/bookgenius/frontend/apps/pipeline/src/tools/migration/apply-migration.ts <planPath>
```

Updates Convex with new paragraph indices.

### 5. Verify with tests (TODO)

```bash
bun test apps/pipeline/src/tools/migration/__tests__/verify-{bookSlug}.spec.ts
```

Ensures all cues still point to correct content.

## Files Structure

```
migration/
├── README.md                     # This file
├── types.ts                      # TypeScript types
├── find-books-with-cues.ts       # Step 1: List affected books
├── migrate-book.ts               # Step 2: Orchestrator
├── snapshot-book-cues.ts         # Backup cues to JSON
├── build-index-mappings.ts       # Build old→new mappings
├── review-mappings-cli.ts        # Step 3: Interactive review
├── apply-migration.ts            # Step 4: Update Convex (TODO)
├── backups/                      # Cue snapshots (gitignored)
├── plans/                        # Migration plans (gitignored)
└── __tests__/                    # Per-book verification tests
```

## Safety

1. **Backups:** Every migration creates a timestamped backup of cues
2. **Manual review:** Fuzzy/manual matches require approval
3. **Test-driven:** Each book gets verification tests
4. **Reversible:** Backups can be restored via Convex mutations
5. **One-at-a-time:** Migrate books individually, verify before next

## Current Status

✅ **Done:**
- Book identification
- Cue snapshotting
- Migration plan builder
- CLI review tool
- Convex mutations

🚧 **TODO:**
- Implement new paragraph extraction logic (nested handling)
- Apply migration script
- Per-book test generator
- Restore from backup script

## Books to Migrate (20 total, 1,394 cues)

Run `find-books-with-cues.ts` for current list.

Top books by cue count:
- Faraon: 332 cues
- Lalka: 226 cues
- Secret-Father: 183 cues
- 1984-English: 127 cues
- 1984: 126 cues
- (15 more...)
