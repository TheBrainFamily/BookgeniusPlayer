#!/usr/bin/env bash
export AWS_REGION=auto

set -euo pipefail

ENDPOINT_FLAG=( --endpoint-url "$S3_ENDPOINT_URL" )
short_cache='public, max-age=60, s-maxage=300, stale-while-revalidate=86400'
long_cache='public, max-age=31536000, immutable'

# --- platform app ---
s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --cache-control "$short_cache" \
  --content-type "text/html; charset=utf-8" \
  build/platform-app/index.html \
  "s3://${S3_BUCKET}/app/platform/${ASSET_CONTEXT}/index.html"

s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --exclude "index.html" \
  --cache-control "$long_cache" \
  build/platform-app/ \
  "s3://${S3_BUCKET}/app/platform/${ASSET_CONTEXT}/"


s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --cache-control "$short_cache" \
  --content-type "text/html; charset=utf-8" \
  build/platform-app-intl/index.html \
  "s3://${S3_BUCKET}/app/platform-intl/${ASSET_CONTEXT}/index.html"

s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --exclude "index.html" \
  --cache-control "$long_cache" \
  build/platform-app-intl/ \
  "s3://${S3_BUCKET}/app/platform-intl/${ASSET_CONTEXT}/"

s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --cache-control "$short_cache" \
  --content-type "text/html; charset=utf-8" \
  build/platform-app-snapplify/index.html \
  "s3://${S3_BUCKET}/app/platform-snapplify/${ASSET_CONTEXT}/index.html"

s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
  --exclude "index.html" \
  --cache-control "$long_cache" \
  build/platform-app-snapplify/ \
  "s3://${S3_BUCKET}/app/platform-snapplify/${ASSET_CONTEXT}/"



# --- optional: books/assets + versions.json when explicitly requested ---
if [[ "$*" == *"--with-books"* ]]; then
  s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
    --cache-control "$long_cache" \
    build/s3-data/assets/ \
    "s3://${S3_BUCKET}/${ASSET_CONTEXT}/assets/"

  s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
    --cache-control "$short_cache" \
    --content-type "application/json; charset=utf-8" \
    build/s3-data/versions.json \
    "s3://${S3_BUCKET}/${ASSET_CONTEXT}/versions.json"
fi

# --- conditional: partial or full rebuilds driven by env flags ---
if [[ "${REBUILD_ALL:-0}" == "1" || -n "${CHANGED_BOOKS:-}" ]]; then
  if [[ -d build/s3-data/assets ]]; then
    s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
      --cache-control "$long_cache" \
      "build/s3-data/assets/" \
      "s3://${S3_BUCKET}/${ASSET_CONTEXT}/assets/"
  fi

  if [[ "${ASSET_CONTEXT}" == "prod" ]]; then
    s5cmd "${ENDPOINT_FLAG[@]}" cp "s3://${S3_BUCKET}/prod/versions.json" "build/s3-data/versions-prod.json" || true
    if [[ -f build/s3-data/versions-prod.json ]]; then
      pnpm update-prod-versions
    fi
  fi

  if [[ -f build/s3-data/versions.json ]]; then
    s5cmd "${ENDPOINT_FLAG[@]}" --numworkers 256 cp -c 256 \
      --cache-control "$short_cache" \
      --content-type "application/json; charset=utf-8" \
      "build/s3-data/versions.json" \
      "s3://${S3_BUCKET}/${ASSET_CONTEXT}/versions.json"
  fi
fi


# --- CloudFlare cache purge for production ---
  curl -X POST "https://bg-updater.bookgenius.net/?ctx=${ASSET_CONTEXT}&apps=platform-intl&warm=1&host=${DOMAIN}" -H "x-preview-key: $PREVIEW_KEY"

  if [[ "${ASSET_CONTEXT}" == "prod" ]]; then
    curl -X POST "https://bg-updater.bookgenius.net/?ctx=${ASSET_CONTEXT}&apps=platform&warm=1&host=bookgeniusz.pl" -H "x-preview-key: $PREVIEW_KEY"
    curl -X POST "https://bg-updater.bookgenius.net/?ctx=${ASSET_CONTEXT}&apps=platform-snapplify&warm=1&host=bookgenius.snapplify.com" -H "x-preview-key: $PREVIEW_KEY"
  fi

  curl -X POST "https://bg-updater.bookgenius.net/?mode=recompute&ctx=${ASSET_CONTEXT}" -H "x-preview-key: $PREVIEW_KEY"
