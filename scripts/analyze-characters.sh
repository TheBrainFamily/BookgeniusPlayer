#!/bin/bash

# Character Analysis Script
# Analyzes character mentions and speeches in book.xml files

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to Alice in Wonderland if no argument provided
if [ $# -eq 0 ]; then
    BOOK_PATH="$PROJECT_ROOT/public_books/Alice-Wonderland/book.xml"
    echo "No book specified, analyzing Alice in Wonderland..."
else
    # If argument is just a book name, construct the path
    if [[ "$1" != *"/"* ]]; then
        BOOK_PATH="$PROJECT_ROOT/public_books/$1/book.xml"
    else
        BOOK_PATH="$1"
    fi
fi

# Check if the file exists
if [ ! -f "$BOOK_PATH" ]; then
    echo "Error: Book file not found: $BOOK_PATH"
    echo ""
    echo "Usage: $0 [book-name or path-to-book.xml]"
    echo ""
    echo "Examples:"
    echo "  $0                           # Analyze Alice-Wonderland"
    echo "  $0 Pharaon                  # Analyze Pharaon"
    echo "  $0 Conrad-Tajny-Agent       # Analyze Conrad-Tajny-Agent"
    echo "  $0 /path/to/custom/book.xml # Analyze custom book"
    echo ""
    echo "Available books:"
    if [ -d "$PROJECT_ROOT/public_books" ]; then
        ls -1 "$PROJECT_ROOT/public_books" | grep -v "^\\." | sed 's/^/  /'
    fi
    exit 1
fi

echo "Analyzing: $BOOK_PATH"
echo ""

# Run the TypeScript analysis script
npx tsx "$SCRIPT_DIR/analyze-character-mentions.ts" "$BOOK_PATH" 