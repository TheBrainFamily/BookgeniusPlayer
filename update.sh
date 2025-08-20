
# pnpm run build:docker:front-only

BUCKET=webstack-contentbucket52d4b12c-ho2hl8s0ugjd
#CTX=prod
CTX=branches/test

aws s3 cp build/platform-app/index.html \
  s3://$BUCKET/app/platform/${CTX}/index.html \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
  --only-show-errors

aws s3 sync build/platform-app/ s3://$BUCKET/app/platform/${CTX}/ \
  --exclude 'index.html' \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors --size-only --no-progress --delete

aws s3 cp build/player-app/index.html \
  s3://$BUCKET/app/player/${CTX}/index.html \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' \
  --only-show-errors

aws s3 sync build/player-app/ s3://$BUCKET/app/player/${CTX}/ \
  --exclude 'index.html' \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors --size-only --no-progress --delete

if [[ "$*" == *"--with-books"* ]]; then
  s5cmd --numworkers=256 cp --show-progress build/s3-data/assets/ "s3://$BUCKET/$CTX/assets/" --cache-control "public, max-age=31536000, immutable"
  s5cmd --numworkers=256 cp --show-progress build/s3-data/assets/ "s3://$BUCKET/$CTX/assets/" --cache-control "public, max-age=31536000, immutable"

  aws s3 cp build/s3-data/versions.json s3://$BUCKET/$CTX/versions.json \
    --content-type 'application/json; charset=utf-8' \
    --cache-control 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' 
fi

aws cloudfront create-invalidation --distribution-id EA1G0X30KGB3M --paths "/app/platform/${CTX}/index.html"
aws cloudfront create-invalidation --distribution-id EA1G0X30KGB3M --paths "/app/player/${CTX}/index.html"
aws cloudfront create-invalidation --distribution-id EVNFFUQOPD9AS --paths "/app/platform/${CTX}/index.html"
aws cloudfront create-invalidation --distribution-id EVNFFUQOPD9AS --paths "/app/player/${CTX}/index.html"