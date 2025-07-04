#!/bin/bash

set -e

RUN_ID="$1"
LOCAL_SUMMARY_DIR="summary"

if [ -z "$RUN_ID" ]; then
  echo "Error: Missing required argument: RUN_ID"
  echo "Usage: $0 <run-id>"
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

if [ -z "$DEPLOY_STATUS_DIR" ]; then
  echo "Error: Environment variable DEPLOY_STATUS_DIR is not set."
  exit 1
fi

mkdir -p "$LOCAL_SUMMARY_DIR"
rsync -avz -e "ssh" \
  "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_STATUS_DIR/$RUN_ID/" "$LOCAL_SUMMARY_DIR/"

shopt -s nullglob
HEADER="## Deployment Summary
| Book Name | Deployment URL |
|-----------|----------------|"
BODY=$(cat "$LOCAL_SUMMARY_DIR"/*.txt || true)
shopt -u nullglob

SUMMARY="$HEADER"$'\n'"$BODY"
echo "$SUMMARY" | tee summary.txt >> "$GITHUB_STEP_SUMMARY"

ssh "$DEPLOY_USER@$DEPLOY_HOST" "rm -rf \"$DEPLOY_STATUS_DIR/$RUN_ID\""
rm -rf "$LOCAL_SUMMARY_DIR"
