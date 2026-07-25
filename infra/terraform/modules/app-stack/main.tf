# app-stack — reusable per-app AWS baseline.
#
# Instantiated once per application (pattadar today; future apps re-use it).
# Resource files:
#   kms.tf           — customer-managed key + alias
#   s3.tf            — documents bucket + access-logs bucket
#   ecr.tf           — api / gateway / assistant repositories
#   rds.tf           — PostgreSQL 17 instance
#   secrets.tf       — placeholder Secrets Manager secrets
#   observability.tf — log groups, SNS alarm topic, sample RDS alarm
#   scheduler.tf     — daily inactivity-check via EventBridge Scheduler + API destination
#   stubs.tf         — TODO(Phase 1) sketches: VPC, ALB/ECS, CloudFront/WAF, GuardDuty, Route53/ACM

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  prefix = "${var.app_name}-${var.environment}"

  services = toset(["api", "gateway", "assistant"])

  tags = merge(var.tags, {
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}
