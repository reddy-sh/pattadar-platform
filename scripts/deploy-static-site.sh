#!/usr/bin/env bash
# Publish an already-built Pattadar SPA to its versioned, private S3 origin.
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <dist-dir> <bucket> <distribution-id> <release-sha>" >&2
  exit 2
fi

dist_dir="$1"
bucket="$2"
distribution_id="$3"
release_sha="$4"

if [[ ! -s "$dist_dir/index.html" || ! "$bucket" =~ ^pattadar-prod-(spa|university-spa)-[0-9]{12}$ || ! "$distribution_id" =~ ^E[A-Z0-9]+$ || ! "$release_sha" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Refusing to deploy: missing site build or invalid production target/revision." >&2
  exit 2
fi

printf '%s\n' "$release_sha" > "$dist_dir/.release-sha"
aws s3 sync "$dist_dir/" "s3://$bucket/" --delete --only-show-errors \
  --cache-control 'public,max-age=0,must-revalidate'
invalidation_id="$(aws cloudfront create-invalidation \
  --distribution-id "$distribution_id" --paths '/*' \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed \
  --distribution-id "$distribution_id" --id "$invalidation_id"
echo "Deployed $release_sha to s3://$bucket (CloudFront $distribution_id, invalidation $invalidation_id)."
