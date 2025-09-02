#!/usr/bin/env bash

export AWS_REGION=auto

set -euo pipefail

ENDPOINT_FLAG=( --endpoint-url "$S3_ENDPOINT_URL" )

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${ASSET_CONTEXT:?ASSET_CONTEXT is required}"
: "${S3_ENDPOINT_URL:?S3_ENDPOINT_URL is required}"
# extra paranoia: forbid root- or near-root contexts
case "$ASSET_CONTEXT" in ""|"/"|"."|".."|*"..*" )
  echo "Refusing to delete: unsafe ASSET_CONTEXT='$ASSET_CONTEXT'" >&2
  exit 1
;; esac

s5cmd "${ENDPOINT_FLAG[@]}" rm "s3://${S3_BUCKET}/app/platform/${ASSET_CONTEXT}/*"
s5cmd "${ENDPOINT_FLAG[@]}" rm "s3://${S3_BUCKET}/app/platform-intl/${ASSET_CONTEXT}/*"
s5cmd "${ENDPOINT_FLAG[@]}" rm "s3://${S3_BUCKET}/app/platform-snapplify/${ASSET_CONTEXT}/*"
s5cmd "${ENDPOINT_FLAG[@]}" rm "s3://${S3_BUCKET}/app/player/${ASSET_CONTEXT}/*"
s5cmd "${ENDPOINT_FLAG[@]}" rm "s3://${S3_BUCKET}/${ASSET_CONTEXT}/*" \
  || { echo "WARN: nothing to delete at /${ASSET_CONTEXT}" >&2; }
