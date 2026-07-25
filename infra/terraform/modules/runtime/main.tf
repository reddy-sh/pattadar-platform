# runtime — the layer scripts/platform-up.sh / platform-down.sh create and
# destroy on demand. Everything here is recreatable from the persistent layer
# (data, identity, images, secrets), which it reads via terraform_remote_state.
#
# Resource files:
#   vpc.tf             — 2-AZ public-subnet VPC, IGW (NO NAT — see cost note)
#   security_groups.tf — alb / gateway / api / rds tiering
#   alb.tf             — ALB (idle_timeout 200), api.<domain> ACM cert, listeners
#   ecs.tf             — cluster + gateway/api Fargate services, IAM roles
#   rds.tf             — PostgreSQL 17 + composed db-dsn runtime secret
#   scheduler.tf       — daily /cron/inactivity-check (EventBridge Scheduler)
#   observability.tf   — log groups, SNS alarms topic + email, CloudWatch alarms
#   cloudfront.tf      — SPA bucket + OAC, distribution, us-east-1 cert, WAF
#   route53.tf         — apex/www -> CloudFront, api -> ALB (persistent zone)

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# Persistent-layer outputs (KMS, buckets, ECR, secrets, Cognito, zone, SES).
# Backend config comes in via variables so the dev and prod roots differ only
# in tfvars. Apply order is always persistent -> runtime.
data "terraform_remote_state" "persistent" {
  backend = "s3"

  config = {
    bucket = var.tf_state_bucket
    key    = "${var.environment}/persistent.tfstate"
    region = var.tf_state_region
  }
}

locals {
  prefix = "${var.app_name}-${var.environment}"

  services = toset(["gateway", "api", "assistant"])

  persistent = data.terraform_remote_state.persistent.outputs

  # The persistent zone id is null when this env's persistent layer runs with
  # manage_dns = false (shared-account dev). In that case pass the owning
  # env's zone id explicitly via var.route53_zone_id.
  # Terraform drops null-valued root outputs from state, so these may be
  # ABSENT (not just null) in shared-account dev — read with try().
  zone_id = var.route53_zone_id != "" ? var.route53_zone_id : try(local.persistent.route53_zone_id, null)

  ses_identity_arn = try(local.persistent.ses_identity_arn, null)

  www_domain = "www.${var.web_domain}"

  tags = merge(var.tags, {
    App         = var.app_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Layer       = "runtime"
  })
}
