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
  echo "Error: Environment variable DEPLOY_DOMAIN is not set."
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

if [ -z "$DEPLOY_AWS_BUCKET" ]; then
  echo "Error: Environment variable DEPLOY_AWS_BUCKET is not set."
  exit 1
fi

if [ -z "$AWS_REGION" ]; then
  echo "Error: Environment variable AWS_REGION is not set."
  exit 1
fi

# preparing assets files // for now only for branches
ARCHIVE_NAME="${BOOK_NAME}.tar.gz"
S3_REMOTE_PATH="s3://${DEPLOY_AWS_BUCKET}/main/${ARCHIVE_NAME}"
if [[ "$BRANCH_NAME" != "main" ]]; then
  export GIT_LFS_SKIP_SMUDGE=1
  git lfs install --skip-smudge
  git fetch origin main --depth=1
  BASE_SHA=$(git rev-parse origin/main)
  CHANGED_FILES=$(git diff --name-only ${BASE_SHA} HEAD -- public public_books || true)

  cat public_books/Lalka/assets/adwokat.png | head -n 1

  aws s3 cp "${S3_REMOTE_PATH}" "${ARCHIVE_NAME}"
  tar -xzf "$ARCHIVE_NAME" -C "$(dirname "$BOOK_PATH")"

  MATCHED=$(echo "$CHANGED_FILES" | grep "^$BOOK_PATH" || true)
  if [[ -n "$MATCHED" ]]; then
    echo "$MATCHED" > changed.txt
    if [[ -s changed.txt ]]; then
      echo "Pulling changed LFS files for ${BOOK_NAME}:"
      cat changed.txt

      # restore LFS pointers
      while IFS= read -r file; do
        echo "file: ${file}"
        git checkout -f -- "$file"
        oid=$(grep "oid sha256" "$file" | awk '{print $2}')
        echo "SHA: $oid"
        if [[ -n "$oid" ]]; then
#          git lfs fetch --object-id "$oid"
#          git lfs checkout --include="$file"
          echo "oid is here ${oid}"
        else
          echo "File  $file is not a LFS pointer"
        fi
      done < changed.txt
    else
      echo "No LFS files to pull"
    fi
    rm changed.txt
  fi
else
  echo "Making an archive..."
  tar -zcf "${ARCHIVE_NAME}" -C "$(dirname "$BOOK_PATH")" "$(basename "$BOOK_PATH")"
  echo "Uploading to S3"
  aws s3 cp "${ARCHIVE_NAME}" "${S3_REMOTE_PATH}"
  rm "${ARCHIVE_NAME}"
fi
exit 0

# build and deploy
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
