# --- Village-maps bucket -----------------------------------------------------
# Shipped village cadastral maps (public survey-department reference data, no
# owner or document data), built by scripts/village-map-import.py and published
# by scripts/vm-publish.py under state/district/mandal/village keys. ~116 MB
# for the 2021 Prakasam archive — too large for the SPA bundle, and the source
# KMZs live off-repo, so the data must SURVIVE platform-down: persistent layer.
#
# Private: only the CloudFront distribution reads it (OAC). The bucket POLICY
# that grants that read is runtime-owned (modules/runtime/cloudfront.tf),
# because it names the distribution ARN; with the runtime layer down the bucket
# has no policy and nobody but the account can read it.
#
# Versioned so a bad publish can be rolled back object by object; old versions
# expire after 90 days.

resource "aws_s3_bucket" "village_maps" {
  bucket = "${local.prefix}-vm-${data.aws_caller_identity.current.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "village_maps" {
  bucket = aws_s3_bucket.village_maps.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "village_maps" {
  bucket = aws_s3_bucket.village_maps.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # public reference data served by CloudFront; no CMK round-trips
    }
  }
}

resource "aws_s3_bucket_public_access_block" "village_maps" {
  bucket = aws_s3_bucket.village_maps.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "village_maps" {
  bucket = aws_s3_bucket.village_maps.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "village_maps" {
  bucket = aws_s3_bucket.village_maps.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90 # two publish cycles of rollback; the KMZ source is the real archive
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
