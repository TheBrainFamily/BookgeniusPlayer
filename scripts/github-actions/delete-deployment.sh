#!/bin/bash

set -euo pipefail

if [ -z "$BRANCH_NAME" ]; then
  echo "Error: Environment variable BRANCH_NAME is not set."
  exit 1
fi

if [[ "$BRANCH_NAME" == "main" ]]; then
  echo "Error: main branch is protected."
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

if [ -z "$DEPLOY_ROOT_DIR" ]; then
  echo "Error: Environment variable DEPLOY_ROOT_DIR is not set."
  exit 1
fi

echo "Deleting folders matching ${DEPLOY_ROOT_DIR}/${BRANCH_NAME}-* on $DEPLOY_HOST"
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "find \"${DEPLOY_ROOT_DIR}\" -maxdepth 1 -type d -name '${BRANCH_NAME}-*' -exec rm -rf {} +"
