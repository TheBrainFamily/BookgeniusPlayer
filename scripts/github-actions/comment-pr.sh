#!/bin/bash

set -e

PR_NUMBER="$1"
REPO="$2"
COMMENT_TAG="<!-- book-links-deployment-summary -->"

if [ -z "$PR_NUMBER" ]; then
  echo "Error: Missing required argument: PR_NUMBER"
  echo "Usage: $0 <pr-number> <repo>"
  exit 1
fi

if [ -z "$REPO" ]; then
  echo "Error: Missing required argument: REPO"
  echo "Usage: $0 <pr-number> <repo>"
  exit 1
fi

if [ ! -f summary.txt ]; then
  echo "Error: Missing summary.txt file"
  exit 1
fi

SUMMARY=$(cat summary.txt)
BODY="${COMMENT_TAG}
${SUMMARY}"

COMMENT_ID=$(gh api repos/$REPO/issues/$PR_NUMBER/comments \
  --jq ".[] | select(.body | contains(\"$COMMENT_TAG\")) | .id")

if [[ -n "$COMMENT_ID" ]]; then
  echo "Updating existing comment $COMMENT_ID"
  gh api repos/$REPO/issues/comments/$COMMENT_ID \
    -X PATCH \
    -F body="$BODY"
else
  echo "Creating new comment"
  gh api repos/$REPO/issues/$PR_NUMBER/comments \
    -F body="$BODY"
fi
