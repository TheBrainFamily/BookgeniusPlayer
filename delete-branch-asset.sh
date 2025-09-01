#!/usr/bin/env bash

export AWS_REGION=auto

set -euo pipefail

ENDPOINT_FLAG=( --endpoint-url "$S3_ENDPOINT_URL" )

s5cmd rm -r "s3://${S3_BUCKET}/app/platform/${ASSET_CONTEXT}/"
s5cmd rm -r "s3://${S3_BUCKET}/app/platform-intl/${ASSET_CONTEXT}/"
s5cmd rm -r "s3://${S3_BUCKET}/app/platform-snapplify/${ASSET_CONTEXT}/"
s5cmd rm -r "s3://${S3_BUCKET}/app/player/${ASSET_CONTEXT}/"
s5cmd rm -r "s3://${S3_BUCKET}/${ASSET_CONTEXT}/"
