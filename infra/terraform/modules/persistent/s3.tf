# --- Access-logs bucket -----------------------------------------------------
# SSE-S3 (server access logging cannot deliver to an SSE-KMS bucket with a CMK),
# 400-day expiry supports the 1-year log-retention baseline for SOC 2 / DPDP.
# Also the AWS Config delivery target (prefix config/, see cloudtrail.tf).

resource "aws_s3_bucket" "logs" {
  bucket = "${local.prefix}-access-logs-${data.aws_caller_identity.current.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-after-400-days"
    status = "Enabled"

    filter {}

    expiration {
      days = 400
    }
  }
}

data "aws_iam_policy_document" "logs_bucket" {
  # Allow the S3 server-access-logging service to deliver logs.
  statement {
    sid       = "S3ServerAccessLogsPolicy"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Allow ALB access-log delivery (runtime layer, prefix alb/). ap-south-1 is
  # an "older" ELB region: logs are delivered from a regional AWS-owned
  # account (718504428378 for Mumbai), not a service principal.
  statement {
    sid       = "ALBAccessLogsDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::718504428378:root"]
    }
  }

  # Allow AWS Config to verify and deliver configuration snapshots
  # (delivery channel in cloudtrail.tf, prefix config/).
  statement {
    sid = "AWSConfigBucketPermissionsCheck"
    actions = [
      "s3:GetBucketAcl",
      "s3:ListBucket",
    ]
    resources = [aws_s3_bucket.logs.arn]

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "AWSConfigBucketDelivery"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/config/AWSLogs/${data.aws_caller_identity.current.account_id}/Config/*"]

    principals {
      type        = "Service"
      identifiers = ["config.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.logs.arn,
      "${aws_s3_bucket.logs.arn}/*",
    ]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.logs]
}

# --- Documents bucket -------------------------------------------------------
# Land-deed / Aadhaar / passbook uploads. SSE-KMS with the app CMK, versioned,
# fully private, TLS-only.
#
# Parking note: var.parking_storage_class (DEEP_ARCHIVE default) is what
# scripts/platform-down.sh transitions these objects to when the environment
# is parked. Terraform does not manage that transition — see variables.tf.

resource "aws_s3_bucket" "documents" {
  bucket = "${local.prefix}-documents-${data.aws_caller_identity.current.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "documents" {
  bucket = aws_s3_bucket.documents.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3/${var.app_name}-documents/"
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "current-to-standard-ia"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  # Direct-to-S3 uploads land under pending/ and are copied to their real key
  # once the gateway has confirmed them. An upload the client started and never
  # completed has nothing pointing at it, so it is reaped here. One day, not
  # hours: a presigned form lives 15 minutes, but a client that uploaded and
  # then lost its connection before calling upload-complete can retry.
  rule {
    id     = "expire-unconfirmed-uploads"
    status = "Enabled"

    filter {
      prefix = "pending/"
    }

    expiration {
      days = 1
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  # A multipart upload that was abandoned leaves billable parts behind that no
  # object listing shows.
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Browsers POST upload forms straight at this bucket, so the bucket itself must
# answer the preflight — a presigned form with no CORS rule fails at OPTIONS,
# before the signature is ever checked. Only the origins that serve the app are
# allowed, and only the methods a direct upload needs: reads stay proxied
# through the gateway, so GET is not here.
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_methods = ["POST"]
    allowed_origins = var.documents_cors_origins
    allowed_headers = ["*"]
    # The client needs the ETag back to verify what S3 stored.
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

data "aws_iam_policy_document" "documents_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*",
    ]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # GuardDuty Malware Protection tags each object with its scan verdict
  # (guardduty.tf). Enforced here rather than in the gateway task role so no
  # principal — task, human or AI pipeline — can read an infected upload.
  # Only THREATS_FOUND is denied: an untagged object is one the scan has not
  # reached yet, and denying those would stall every fresh upload.
  statement {
    sid    = "DenyReadOfInfectedDocuments"
    effect = "Deny"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
    ]
    resources = ["${aws_s3_bucket.documents.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:ExistingObjectTag/GuardDutyMalwareScanStatus"
      values   = ["THREATS_FOUND"]
    }
  }

  dynamic "statement" {
    for_each = var.enforce_documents_sse_kms_headers ? [1] : []

    content {
      sid       = "DenyUploadsWithoutKms"
      effect    = "Deny"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.documents.arn}/*"]

      principals {
        type        = "AWS"
        identifiers = ["*"]
      }

      condition {
        test     = "StringNotEquals"
        variable = "s3:x-amz-server-side-encryption"
        values   = ["aws:kms"]
      }
    }
  }

  dynamic "statement" {
    for_each = var.enforce_documents_sse_kms_headers ? [1] : []

    content {
      sid       = "DenyUploadsWithWrongKmsKey"
      effect    = "Deny"
      actions   = ["s3:PutObject"]
      resources = ["${aws_s3_bucket.documents.arn}/*"]

      principals {
        type        = "AWS"
        identifiers = ["*"]
      }

      condition {
        test     = "StringNotEquals"
        variable = "s3:x-amz-server-side-encryption-aws-kms-key-id"
        values   = [aws_kms_key.main.arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.documents_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.documents]
}
