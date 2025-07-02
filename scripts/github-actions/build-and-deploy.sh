#!/bin/bash

set -e

BOOKS_DIR="public_books"

if [ -z "$1" ]; then
  echo "You need to pass title"
  exit 1
fi

BOOK_NAME="$1"
BOOK_PATH="$BOOKS_DIR/$BOOK_NAME"

if [ ! -d "$BOOK_PATH" ]; then
  echo "Book directory not found $BOOK_PATH"
  exit 1
fi

if [ -z "$DEPLOY_HOST" ]; then
  echo "Environment variable DEPLOY_HOST is not set."
  exit 1
fi

# Different locales for specific books
get_book_lang() {
  case "$1" in
    "Conrad-Tajny-Agent") echo "PL" ;;
    *) echo "EN" ;;
  esac
}

# Different subdomain/directory for specific books
get_deploy_dir() {
  case "$1" in
#    "Alice-Wonderland") echo "alice" ;;
#    "Conrad-Tajny-Agent") echo "tajny-agent" ;;
    *) echo "" ;;
  esac
}

VITE_LANG=$(get_book_lang "$BOOK_NAME")
DEPLOY_DIR=$(get_deploy_dir "$BOOK_NAME")

if [ -n "$DEPLOY_DIR" ]; then
  LOWERCASE_BOOK_NAME="$DEPLOY_DIR"
else
  LOWERCASE_BOOK_NAME=$(echo "$BOOK_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[-_]//g')
fi

echo "Target server directory: $LOWERCASE_BOOK_NAME"

rm -rf ./dist

#VITE_LANG="$VITE_LANG" \
#VITE_BOOK="$BOOK_NAME" \
#VITE_BOOK_NAME="$BOOK_NAME" \
#VITE_BOOK_PATH="$BOOK_PATH/" \
#VITE_BOOK_DIR="$BOOK_PATH" \
#npx vite build

pnpm build "$BOOK_PATH"

echo "Sending: $DEPLOY_HOST:/var/www/$LOWERCASE_BOOK_NAME"
rsync -av ./dist/ root@"$DEPLOY_HOST":/var/www/daniel-"$LOWERCASE_BOOK_NAME"

rm -rf ./dist
echo "Done."
