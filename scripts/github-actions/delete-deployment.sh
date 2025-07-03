#!/bin/bash

set -e

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

echo "Deleting folders matching /var/www/${BRANCH_NAME}-* on $DEPLOY_HOST"
ssh ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
  "find /var/www -maxdepth 1 -type d -name '${BRANCH_NAME}-*' -exec rm -rf {} +"
