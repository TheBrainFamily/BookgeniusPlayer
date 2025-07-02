#!/bin/bash

set -e

RUN_ID="$1"
REMOTE_BASE_DIR="/root/github-builds"
LOCAL_SUMMARY_DIR="summary"

if [ -z "$DEPLOY_HOST" ]; then
  echo "Environment variable DEPLOY_HOST is not set."
  exit 1
fi

mkdir -p "$LOCAL_SUMMARY_DIR"
rsync -avz -e "ssh" \
  "root@$DEPLOY_HOST:$REMOTE_BASE_DIR/$RUN_ID/" "$LOCAL_SUMMARY_DIR/"

echo "## Deployment Summary" >> "$GITHUB_STEP_SUMMARY"
echo "| Book Name | Deployment URL |" >> "$GITHUB_STEP_SUMMARY"
echo "|-----------|----------------|" >> "$GITHUB_STEP_SUMMARY"
cat "$LOCAL_SUMMARY_DIR"/*.txt >> "$GITHUB_STEP_SUMMARY"

ssh "root@$DEPLOY_HOST" "rm -rf $REMOTE_BASE_DIR/$RUN_ID"
