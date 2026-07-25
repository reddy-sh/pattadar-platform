# GuardDuty detector + Malware Protection for S3 on the documents bucket —
# land-deed / Aadhaar / passbook uploads are scanned before extraction touches
# them. The IAM role below is the one the old stubs referenced but never
# defined; permissions follow the AWS "Malware Protection for S3 prerequisite
# role" documentation.
# Account/region singleton — gated by var.manage_org_security.

resource "aws_guardduty_detector" "main" {
  count = var.manage_org_security ? 1 : 0

  enable = true
  tags   = local.tags
}

# --- IAM role GuardDuty assumes to scan + tag documents ---------------------

data "aws_iam_policy_document" "guardduty_malware_assume" {
  count = var.manage_org_security ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["malware-protection-plan.guardduty.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:guardduty:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:malware-protection-plan/*"]
    }
  }
}

data "aws_iam_policy_document" "guardduty_malware" {
  count = var.manage_org_security ? 1 : 0

  # GuardDuty wires object-created notifications through a managed
  # EventBridge rule it owns.
  statement {
    sid = "ManagedEventBridgeRules"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:PutTargets",
      "events:RemoveTargets",
    ]
    resources = ["arn:aws:events:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*"]

    condition {
      test     = "StringLike"
      variable = "events:ManagedBy"
      values   = ["malware-protection-plan.guardduty.amazonaws.com"]
    }
  }

  statement {
    sid = "DescribeManagedRules"
    actions = [
      "events:DescribeRule",
      "events:ListTargetsByRule",
    ]
    resources = ["arn:aws:events:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*"]
  }

  statement {
    sid = "BucketNotificationsAndList"
    actions = [
      "s3:GetBucketNotification",
      "s3:PutBucketNotification",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.documents.arn]
  }

  statement {
    sid = "ReadAndTagObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:GetObjectTagging",
      "s3:GetObjectVersionTagging",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionTagging",
    ]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }

  # Documents bucket is SSE-KMS with the app CMK.
  statement {
    sid = "DecryptDocuments"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [aws_kms_key.main.arn]

    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["s3.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "guardduty_malware" {
  count = var.manage_org_security ? 1 : 0

  name               = "${local.prefix}-guardduty-malware"
  assume_role_policy = data.aws_iam_policy_document.guardduty_malware_assume[0].json
  tags               = local.tags
}

resource "aws_iam_role_policy" "guardduty_malware" {
  count = var.manage_org_security ? 1 : 0

  name   = "malware-protection-s3"
  role   = aws_iam_role.guardduty_malware[0].id
  policy = data.aws_iam_policy_document.guardduty_malware[0].json
}

# --- Malware Protection plan on the documents bucket ------------------------

resource "aws_guardduty_malware_protection_plan" "documents" {
  count = var.manage_org_security ? 1 : 0

  role = aws_iam_role.guardduty_malware[0].arn

  protected_resource {
    s3_bucket {
      bucket_name = aws_s3_bucket.documents.id
    }
  }

  actions {
    tagging {
      status = "ENABLED" # tag objects with scan verdict; enforce via bucket policy later
    }
  }

  tags = local.tags

  depends_on = [
    aws_guardduty_detector.main,
    aws_iam_role_policy.guardduty_malware,
  ]
}
