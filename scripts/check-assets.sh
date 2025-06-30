#!/bin/bash

# Script to check character assets for books
# Usage: ./check-assets.sh [book-name]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to Krolowa-Sniegu if no book name provided
BOOK_NAME="${1:-Krolowa-Sniegu}"

echo "🔍 Checking character assets for: $BOOK_NAME"
echo ""

# Run the TypeScript script
cd "$PROJECT_ROOT"
npx tsx "$SCRIPT_DIR/check-character-assets.ts" "$BOOK_NAME"

echo ""
echo "✅ Asset check completed!" 