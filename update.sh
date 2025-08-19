
pnpm run build:docker:front-only

BUCKET=webstack-contentbucket52d4b12c-ho2hl8s0ugjd
CTX=prod

aws s3 cp build/platform-app/index.html \
  s3://$BUCKET/app/platform/prod/index.html \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
  --only-show-errors

aws s3 sync build/platform-app/ s3://$BUCKET/app/platform/prod/ \
  --exclude 'index.html' \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors --size-only --no-progress --delete

aws cloudfront create-invalidation --distribution-id EA1G0X30KGB3M --paths '/app/platform/prod/index.html'