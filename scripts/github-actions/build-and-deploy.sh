#!/bin/sh

set -e

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
    "Alice-Wonderland") echo "alice" ;;
    "Conrad-Tajny-Agent") echo "tajny-agent" ;;
    *) echo "" ;;
  esac
}
BOOKS_DIR="public_books"

if [ -z "$DEPLOY_HOST" ]; then
  echo "Environment variable DEPLOY_HOST is not set."
  exit 1
fi

echo "Cleaning up ./dist"
rm -rf ./dist

for dir in "$BOOKS_DIR"/*/; do
  BOOK_NAME=$(basename "$dir")
  VITE_LANG=$(get_book_lang "$BOOK_NAME")

  if [[ -n "${BOOK_LANG_MAP[$BOOK_NAME]}" ]]; then
    VITE_LANG="${BOOK_LANG_MAP[$BOOK_NAME]}"
  fi

  VITE_BOOK="$BOOK_NAME"
  VITE_BOOK_PATH="$BOOKS_DIR/$BOOK_NAME/"
  VITE_BOOK_DIR="$BOOKS_DIR/$BOOK_NAME"

  echo "Building and syncing book: $BOOK_NAME (lang=$VITE_LANG)"

  pnpm build "$VITE_BOOK_DIR"

  VITE_LANG="$VITE_LANG" \
  VITE_BOOK="$VITE_BOOK" \
  VITE_BOOK_NAME="$VITE_BOOK" \
  VITE_BOOK_PATH="$VITE_BOOK_PATH" \
  VITE_BOOK_DIR="$VITE_BOOK_DIR" \
  npx vite build

  DEPLOY_DIR=$(get_deploy_dir "$BOOK_NAME")
  if [ -n "$DEPLOY_DIR" ]; then
  LOWERCASE_BOOK_NAME="$DEPLOY_DIR"
else
  LOWERCASE_BOOK_NAME=$(echo "$BOOK_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[-_]//g')
fi

  rsync -av ./dist/ root@"$DEPLOY_HOST":/var/www/"$LOWERCASE_BOOK_NAME"

  echo "Cleaning up ./dist"
  rm -rf ./dist
done
