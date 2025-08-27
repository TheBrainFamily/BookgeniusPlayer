# pnpm run build:docker:front-only

#S3_BUCKET=webstack-contentbucket52d4b12c-ho2hl8s0ugjd
#ASSET_CONTEXT=branches/test

if [ -z "$S3_BUCKET" ]; then
  S3_BUCKET="webcontent.$DOMAIN"
fi

# apps (always)
aws s3 cp build/platform-app/index.html "s3://$S3_BUCKET/app/platform/${ASSET_CONTEXT}/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
  --only-show-errors

aws s3 sync build/platform-app/ "s3://$S3_BUCKET/app/platform/${ASSET_CONTEXT}/" \
  --exclude 'index.html' \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors --size-only --no-progress --delete

aws s3 cp build/player-app/index.html "s3://$S3_BUCKET/app/player/${ASSET_CONTEXT}/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
  --only-show-errors

aws s3 sync build/player-app/ "s3://$S3_BUCKET/app/player/${ASSET_CONTEXT}/" \
  --exclude 'index.html' \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors --size-only --no-progress --delete

if [[ "$*" == *"--with-books"* ]]; then
  s5cmd --numworkers 256 cp -c 256 --cache-control "public, max-age=31536000, immutable"  build/s3-data/assets/ "s3://${S3_BUCKET}/${ASSET_CONTEXT}/assets/"
  #s5cmd --numworkers=256 cp --show-progress build/s3-data/assets/ "s3://$S3_BUCKET/$CTX/assets/" --cache-control "public, max-age=31536000, immutable"

  aws s3 cp build/s3-data/versions.json "s3://${S3_BUCKET}/${ASSET_CONTEXT}/versions.json" \
    --content-type 'application/json; charset=utf-8' \
    --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'
fi

if [[ "${REBUILD_ALL:-0}" == "1" || -n "${CHANGED_BOOKS:-}" ]]; then
  if [[ -d build/s3-data/assets ]]; then
    # If REBUILD_ALL, this directory will contain all; otherwise just changed books
    s5cmd --numworkers 256 cp -c 256 --cache-control "public, max-age=31536000, immutable" "build/s3-data/assets/" "s3://$S3_BUCKET/${ASSET_CONTEXT}/assets/"
  fi

  if [[ -f build/s3-data/versions.json ]]; then
    # sparse overwrite: only changed books; missing ones fall back to main
    aws s3 cp build/s3-data/versions.json "s3://$S3_BUCKET/${ASSET_CONTEXT}/versions.json" \
      --content-type 'application/json; charset=utf-8' \
      --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
      --only-show-errors
  fi
fi



if [ "${CI:-false}" = "false" ]; then
  echo "Running in CI environment - manual CloudFront invalidation based on the domain name"
  DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?@=='$DOMAIN']].Id" \
  --output text)
  aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/app/platform/${ASSET_CONTEXT}/index.html" "/app/player/${ASSET_CONTEXT}/index.html"
  exit 0
fi

# CF invalidations (only index.html)
if [ "${IS_PRODUCTION:-false}" = "true" ]; then
    aws cloudfront create-invalidation --distribution-id $PROD_DISTRIBUTION_ID --paths "/app/platform/${ASSET_CONTEXT}/index.html" "/app/player/${ASSET_CONTEXT}/index.html"
else
    aws cloudfront create-invalidation --distribution-id $BRANCHES_DISTRIBUTION_ID --paths "/app/platform/${ASSET_CONTEXT}/index.html" "/app/player/${ASSET_CONTEXT}/index.html"
fi