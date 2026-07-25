# CloudTrail (audit) + AWS Config (configuration history).
# Both are account/region singletons — gated by var.manage_org_security so a
# second env in the same account does not fight over them.

locals {
  trail_name = "${local.prefix}-trail"
  trail_arn  = "arn:aws:cloudtrail:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"
}

# --- CloudTrail bucket ------------------------------------------------------
# SSE-S3 (keeps the trail decoupled from the app CMK), versioned, private.

resource "aws_s3_bucket" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = "${local.prefix}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    id     = "expire-after-400-days"
    status = "Enabled"

    filter {}

    expiration {
      days = 400
    }
  }
}

data "aws_iam_policy_document" "cloudtrail_bucket" {
  count = var.manage_org_security ? 1 : 0

  statement {
    sid       = "AWSCloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail[0].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "AWSCloudTrailWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.cloudtrail[0].arn,
      "${aws_s3_bucket.cloudtrail[0].arn}/*",
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

resource "aws_s3_bucket_policy" "cloudtrail" {
  count = var.manage_org_security ? 1 : 0

  bucket = aws_s3_bucket.cloudtrail[0].id
  policy = data.aws_iam_policy_document.cloudtrail_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.cloudtrail]
}

# --- Trail ------------------------------------------------------------------

resource "aws_cloudtrail" "main" {
  count = var.manage_org_security ? 1 : 0

  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  # Management events only for now — S3 data events multiply cost quickly.
  # TODO(Phase 2): add a data-event selector for the documents bucket if the
  # audit posture requires object-level trails.
  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = local.tags

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# --- AWS Config -------------------------------------------------------------
# Records all supported resource types (incl. global) and delivers to the
# access-logs bucket under config/ (bucket policy in s3.tf).
#
# Uses the Config service-linked role. If AWSServiceRoleForConfig already
# exists in the account, import it:
#   terraform import 'module.persistent.aws_iam_service_linked_role.config[0]' \
#     arn:aws:iam::<ACCOUNT_ID>:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig

resource "aws_iam_service_linked_role" "config" {
  count = var.manage_org_security ? 1 : 0

  aws_service_name = "config.amazonaws.com"
}

resource "aws_config_configuration_recorder" "main" {
  count = var.manage_org_security ? 1 : 0

  name     = local.prefix
  role_arn = aws_iam_service_linked_role.config[0].arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "main" {
  count = var.manage_org_security ? 1 : 0

  name           = local.prefix
  s3_bucket_name = aws_s3_bucket.logs.id
  s3_key_prefix  = "config"

  depends_on = [
    aws_config_configuration_recorder.main,
    aws_s3_bucket_policy.logs,
  ]
}

resource "aws_config_configuration_recorder_status" "main" {
  count = var.manage_org_security ? 1 : 0

  name       = aws_config_configuration_recorder.main[0].name
  is_enabled = true

  depends_on = [aws_config_delivery_channel.main]
}
