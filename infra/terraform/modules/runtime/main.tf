# runtime — the layer scripts/platform-up.sh / platform-down.sh create and
# destroy on demand. Everything here is recreatable from the persistent layer
# (data, identity, images, KMS), which it reads via terraform_remote_state, and
# from the out-of-band SSM SecureStrings (local.ssm_arns), which outlive it.
#
# Resource files:
#   vpc.tf             — 2-AZ public-subnet VPC, IGW (NO NAT — see cost note)
#   security_groups.tf — rds admits the ECS host only
#   ec2.tf             — the one ECS host (t4g, bridge mode), its role, SG, patching, host probe
#   api_edge.tf        — api.<domain> CloudFront distribution + VPC origins to the host
#   ecs.tf             — cluster + gateway/api/assistant EC2-launch services, IAM roles
#   rds.tf             — PostgreSQL 17 (app password is the db-app-password SSM parameter)
#   scheduler.tf       — daily /cron/inactivity-check (EventBridge rule -> API destination)
#   observability.tf   — log groups, SNS alarms topic + email, CloudWatch alarms
#   cloudfront.tf      — SPA bucket + OAC, distribution, us-east-1 cert, WAF
#   route53.tf         — apex/www -> SPA distribution, api -> api distribution (persistent zone)

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

  # App secrets live in SSM SecureStrings under the persistent CMK, created
  # out of band (`aws ssm put-parameter`) so their values never enter state and
  # platform-down cannot delete them. Only the ARNs are built here.
  ssm_arns = {
    for name in ["db-app-password", "cron-secret", "anthropic-api-key", "internal-proxy-secret-api", "internal-proxy-secret-assistant"] :
    name => "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.app_name}/${var.environment}/${name}"
  }

  host_metric_namespace = "Pattadar/Host/${var.environment}"

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
