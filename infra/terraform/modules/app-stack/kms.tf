# Customer-managed KMS key encrypting S3 documents, RDS storage,
# Secrets Manager secrets, and CloudWatch log groups.

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
}

resource "aws_kms_key" "main" {
  description         = "${local.prefix} CMK (S3 documents, RDS, secrets, logs)"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.kms.json
  tags                = local.tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}
