# GitHub Actions OIDC — keyless deploys from reddy-sh/pattadar-platform.
# Account singleton (one OIDC provider per URL, fixed role name) — gated by
# var.manage_github_oidc.
#
# The pattadar-github-deploy role is what .github/workflows/{deploy,platform-up,
# platform-down}.yml assume. Trust is pinned to this repo only: main-branch
# refs and GitHub "environment" deployments.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.manage_github_oidc ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"] # informational — AWS trusts GitHub's root CA directly

  tags = local.tags
}

data "aws_iam_policy_document" "github_deploy_assume" {
  count = var.manage_github_oidc ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:*",
      ]
    }
  }
}

# One managed policy, grouped by concern. Runtime resources (SPA bucket,
# CloudFront distribution) do not exist yet, so those statements are scoped by
# naming convention / tag instead of exact ARN.
# TODO(Track B): tighten SpaSync + CloudFrontInvalidation to the exact runtime
# ARNs once the runtime layer exists, and revisit whether CI (platform-up/down)
# runs full terraform applies — that would need write, not just read.

data "aws_iam_policy_document" "github_deploy" {
  count = var.manage_github_oidc ? 1 : 0

  # docker login to ECR.
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Push service images.
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = ["arn:aws:ecr:*:${data.aws_caller_identity.current.account_id}:repository/${var.app_name}/*"]
  }

  # Sync the built SPA to the runtime-owned site bucket (name convention:
  # pattadar-<env>-spa-<account>).
  statement {
    sid = "SpaSync"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::${var.app_name}-*-spa-*",
      "arn:aws:s3:::${var.app_name}-*-spa-*/*",
    ]
  }

  # Invalidate the CloudFront distribution after an SPA sync.
  statement {
    sid = "CloudFrontInvalidation"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
      "cloudfront:ListDistributions",
    ]
    resources = ["*"]
  }

  # Terraform remote state — both layers, both envs (incl. .tflock files).
  statement {
    sid       = "TfStateListBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.app_name}-terraform-state-${data.aws_caller_identity.current.account_id}"]
  }

  statement {
    sid = "TfStateReadWrite"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      "arn:aws:s3:::${var.app_name}-terraform-state-${data.aws_caller_identity.current.account_id}/dev/*",
      "arn:aws:s3:::${var.app_name}-terraform-state-${data.aws_caller_identity.current.account_id}/prod/*",
    ]
  }

  # Read-side surface terraform plan/output needs (no secret values, no writes).
  statement {
    sid = "TerraformRead"
    actions = [
      "acm:Describe*",
      "acm:Get*",
      "acm:List*",
      "application-autoscaling:Describe*",
      "cloudfront:Get*",
      "cloudfront:List*",
      "cloudtrail:Describe*",
      "cloudtrail:Get*",
      "cloudtrail:List*",
      "cloudwatch:Describe*",
      "cloudwatch:Get*",
      "cloudwatch:List*",
      "cognito-idp:Describe*",
      "cognito-idp:Get*",
      "cognito-idp:List*",
      "config:Describe*",
      "ec2:Describe*",
      "ecr:Get*",
      "ecr:List*",
      "ecs:Describe*",
      "ecs:List*",
      "elasticloadbalancing:Describe*",
      "events:Describe*",
      "events:List*",
      "guardduty:Get*",
      "guardduty:List*",
      "iam:Get*",
      "iam:List*",
      "kms:Describe*",
      "kms:Get*",
      "kms:List*",
      "lambda:Get*",
      "lambda:List*",
      "logs:Describe*",
      "logs:ListTagsForResource",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "route53:Get*",
      "route53:List*",
      "s3:Get*",
      "s3:List*",
      "scheduler:Get*",
      "scheduler:List*",
      "secretsmanager:Describe*",
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:ListSecrets",
      "ses:Get*",
      "ses:List*",
      "sns:Get*",
      "sns:List*",
      "wafv2:Get*",
      "wafv2:List*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_deploy" {
  count = var.manage_github_oidc ? 1 : 0

  name        = "pattadar-github-deploy"
  description = "GitHub Actions deploy permissions: ECR push, SPA sync + invalidation, terraform state rw, terraform read surface"
  policy      = data.aws_iam_policy_document.github_deploy[0].json
  tags        = local.tags
}

resource "aws_iam_role" "github_deploy" {
  count = var.manage_github_oidc ? 1 : 0

  name               = "pattadar-github-deploy"
  description        = "Assumed via GitHub OIDC by ${var.github_repository} workflows"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume[0].json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  count = var.manage_github_oidc ? 1 : 0

  role       = aws_iam_role.github_deploy[0].name
  policy_arn = aws_iam_policy.github_deploy[0].arn
}
