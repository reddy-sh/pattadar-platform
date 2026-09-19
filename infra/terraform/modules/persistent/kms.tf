# Customer-managed KMS key encrypting S3 documents, Secrets Manager secrets,
# CloudWatch log groups and the SNS alarms topic (runtime layer).

data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "RootAccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  # Allow CloudWatch Logs in this region to use the key for log-group encryption.
  statement {
    sid = "CloudWatchLogsUse"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.region}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/${var.app_name}/*"]
    }
  }

  # CloudWatch alarms publish to the CMK-encrypted SNS alarms topic (runtime);
  # without this the alarm actions fail silently.
  statement {
    sid = "CloudWatchAlarmsUse"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # SNS itself needs the key to encrypt/decrypt messages on the alarms topic.
  statement {
    sid = "SnsUse"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_kms_key" "main" {
  description         = "${local.prefix} CMK (S3 documents, secrets, logs, SNS)"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.kms.json
  tags                = local.tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}

# Dedicated single-Region key for reversible Aadhaar field encryption. This key
# is deliberately separate from the shared documents/logs key so API access can
# be least-privilege and its lifecycle can be governed independently.
data "aws_iam_policy_document" "aadhaar_kms" {
  statement {
    sid       = "RootAccountAdmin"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}

resource "aws_kms_key" "aadhaar" {
  description             = "${local.prefix} Aadhaar field encryption"
  enable_key_rotation     = true
  multi_region            = false
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.aadhaar_kms.json
  tags                    = merge(local.tags, { DataClass = "Aadhaar" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "aadhaar" {
  name          = "alias/${local.prefix}-aadhaar"
  target_key_id = aws_kms_key.aadhaar.key_id
}
