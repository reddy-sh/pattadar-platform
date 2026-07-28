# persistent — the layer that SURVIVES a platform-down. Data, identity,
# audit and supply-chain resources that are either stateful (S3, Cognito
# users) or cheap-but-slow-to-recreate (KMS, Route53 NS delegation, SES
# verification, OIDC trust). The runtime layer (compute, ALB, CloudFront,
# RDS, scheduler, observability) reads this layer's outputs via
# terraform_remote_state and is destroyed/recreated by
# scripts/platform-down.sh / platform-up.sh.
#
# Resource files:
#   kms.tf         — customer-managed key + alias (S3 docs, secrets, logs, SNS)
#   s3.tf          — documents bucket + access-logs bucket
#   cloudtrail.tf  — CloudTrail bucket + multi-region trail + AWS Config recorder
#   ecr.tf         — api / gateway / assistant / web repositories
#   secrets.tf     — placeholder Secrets Manager secrets
#   cognito.tf     — user pool, pre-token-gen Lambda, SPA client, hosted-UI domain
#   route53.tf     — public hosted zone pattadar.com (records added by runtime)
#   ses.tf         — SES domain identity, Easy DKIM, MAIL FROM, DMARC
#   guardduty.tf   — detector + S3 Malware Protection plan on the documents bucket
#   github_oidc.tf — GitHub Actions OIDC provider + pattadar-github-deploy role

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  prefix = "${var.app_name}-${var.environment}"

  services = toset(["api", "gateway", "assistant", "web"])

  tags = merge(var.tags, {
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Layer       = "persistent"
  })
}
