#!/bin/bash

set -e

BOOK_NAME="$1"
RUN_ID="$2"
BOOKS_DIR="public_books"
BOOK_PATH="$BOOKS_DIR/$BOOK_NAME"

if [[ -n "$BRANCH_NAME" && "$BRANCH_NAME" != "main" ]]; then
  BRANCH_PREFIX="${BRANCH_NAME}-"
else
  BRANCH_PREFIX=""
fi

if [ -z "$BOOK_NAME" ]; then
  echo "Error: Missing required argument: BOOK_NAME"
  echo "Usage: $0 <book-name> <run-id>"
  exit 1
fi

if [ -z "$RUN_ID" ]; then
  echo "Error: Missing required argument: RUN_ID"
  echo "Usage: $0 <book-name> <run-id>"
  exit 1
fi

if [ ! -d "$BOOK_PATH" ]; then
  echo "Error: Book directory not found $BOOK_PATH"
  exit 1
fi

if [ -z "$DEPLOY_HOST" ]; then
  echo "Error: Environment variable DEPLOY_HOST is not set."
  exit 1
fi

if [ -z "$DEPLOY_USER" ]; then
  echo "Error: Environment variable DEPLOY_USER is not set."
  exit 1
fi

if [ -z "$DEPLOY_DOMAIN" ]; then
  echo "Error: Environment variable $DEPLOY_DOMAIN is not set."
  exit 1
fi

if [ -z "$DEPLOY_ROOT_DIR" ]; then
  echo "Error: Environment variable DEPLOY_ROOT_DIR is not set."
  exit 1
fi

if [ -z "$DEPLOY_STATUS_DIR" ]; then
  echo "Error: Environment variable DEPLOY_STATUS_DIR is not set."
  exit 1
fi

TARGET_DIRECTORY=$(echo "$BOOK_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[-_]//g')

if [[ -n "$BRANCH_PREFIX" ]]; then
  TARGET_DIRECTORY="${BRANCH_PREFIX}${TARGET_DIRECTORY}"
fi

echo "Target server directory: $TARGET_DIRECTORY"

rm -rf ./dist

pnpm build "$BOOK_PATH"

echo "Sending: $DEPLOY_HOST:$DEPLOY_ROOT_DIR/$TARGET_DIRECTORY"
rsync -av ./dist/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_ROOT_DIR/$TARGET_DIRECTORY"

rm -rf ./dist
echo "Done."

echo "| $BOOK_NAME | https://$TARGET_DIRECTORY.$DEPLOY_DOMAIN |" > "$TARGET_DIRECTORY.txt"
ssh "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p $DEPLOY_STATUS_DIR/$RUN_ID"
scp "$TARGET_DIRECTORY.txt" "$DEPLOY_USER@$DEPLOY_HOST":"$DEPLOY_STATUS_DIR/$RUN_ID/"
rm "$TARGET_DIRECTORY.txt"
