#!/bin/bash
# Archive Claude Code conversations older than January 2026
# Safe: moves files to archive directory, doesn't delete anything

set -e

ARCHIVE_DIR="$HOME/.claude/archive-pre-2026"
PROJECTS_DIR="$HOME/.claude/projects"
CUTOFF_DATE="2026-01-01"

echo "=== Claude Code Conversation Archiver ==="
echo "Archive location: $ARCHIVE_DIR"
echo "Keeping conversations from: $CUTOFF_DATE onwards"
echo ""

# Count files to archive (older than cutoff)
OLD_COUNT=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f ! -newermt "$CUTOFF_DATE" 2>/dev/null | wc -l | tr -d ' ')
NEW_COUNT=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f -newermt "$CUTOFF_DATE" 2>/dev/null | wc -l | tr -d ' ')

echo "Files to archive (pre-2026): $OLD_COUNT"
echo "Files to keep (Jan 2026+):   $NEW_COUNT"
echo ""

if [ "$OLD_COUNT" -eq 0 ]; then
    echo "Nothing to archive!"
    exit 0
fi

read -p "Proceed with archiving? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Find and move old files, preserving directory structure
MOVED=0
find "$PROJECTS_DIR" -name "*.jsonl" -type f ! -newermt "$CUTOFF_DATE" -print0 2>/dev/null | while IFS= read -r -d '' file; do
    # Get relative path from projects dir (handle paths starting with -)
    rel_path="${file#$PROJECTS_DIR/}"
    dest_dir="$ARCHIVE_DIR/$(dirname -- "$rel_path")"

    # Create destination directory and move file
    mkdir -p -- "$dest_dir"
    mv -- "$file" "$dest_dir/"

    MOVED=$((MOVED + 1))
    if [ $((MOVED % 500)) -eq 0 ]; then
        echo "  Moved $MOVED files..."
    fi
done

# Clean up empty directories in projects
find "$PROJECTS_DIR" -type d -empty -delete 2>/dev/null || true

# Final count
REMAINING=$(find "$PROJECTS_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l | tr -d ' ')
ARCHIVED=$(find "$ARCHIVE_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "=== Done! ==="
echo "Remaining in projects: $REMAINING"
echo "Archived: $ARCHIVED"
echo ""
echo "To restore, run:"
echo "  cp -r $ARCHIVE_DIR/* $PROJECTS_DIR/"
