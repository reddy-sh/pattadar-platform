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

# Pinned so features stop following AWS's unmanaged defaults (Reddy,
# 25/10/2026). RDS login monitoring is off pre-launch: the DB is private,
# reachable only from the ECS host SG (~$2.38/month); turn it on at launch.
# S3 Protection stays on for the documents bucket. The Malware Protection plan
# below does not depend on any of these.
#
# RUNTIME_MONITORING is the one-host runtime's launch trigger (Reddy,
# 26/10/2026): before real Aadhaar data, either flip it to ENABLED here with
# EC2 agent management (an additional_configuration block) or revert to
# Fargate. Enabling it outside Terraform is reverted by the next apply.
resource "aws_guardduty_detector_feature" "pinned" {
  for_each = { for name, status in {
    S3_DATA_EVENTS     = "ENABLED"
    RDS_LOGIN_EVENTS   = "DISABLED"
    RUNTIME_MONITORING = "DISABLED"
  } : name => status if var.manage_org_security }

  detector_id = aws_guardduty_detector.main[0].id
  name        = each.key
  status      = each.value
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
    # GuardDuty writes a test object to validate the plan; without PutObject the
    # plan sits in WARNING and never validates (review finding).
    sid       = "AllowMalwareValidationObject"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.documents.arn}/malware-protection-resource-validation-object"]
  }

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
      status = "ENABLED" # tag objects with scan verdict; DenyReadOfInfectedDocuments (s3.tf) enforces it
    }
  }

  tags = local.tags

  depends_on = [
    aws_guardduty_detector.main,
    aws_iam_role_policy.guardduty_malware,
  ]
}
