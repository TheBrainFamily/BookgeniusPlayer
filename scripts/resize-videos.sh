#!/bin/bash

# Video resizing script wrapper
# Usage: ./resize-videos.sh <bookName> [width] [height] [--no-backup]

if [ $# -eq 0 ]; then
    echo "Usage: $0 <bookName> [width] [height] [--no-backup]"
    echo ""
    echo "Examples:"
    echo "  $0 1984"
    echo "  $0 1984 480 480"
    echo "  $0 1984 480 480 --no-backup"
    echo ""
    echo "Available books:"
    ls -1 public_books/ | grep -v "^$" | sed 's/^/  /'
    exit 1
fi

# Check if tsx is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed"
    exit 1
fi

# Run the TypeScript script
npx tsx scripts/resize-character-videos.ts "$@" 