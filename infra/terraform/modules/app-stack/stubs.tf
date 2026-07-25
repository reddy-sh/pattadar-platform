# Phase 1 sketches — intentionally commented out, not half-working resources.
# Each block records the decided approach so enabling it is transcription, not design.

# TODO(Phase 1): VPC — use terraform-aws-modules/vpc/aws rather than hand-rolling.
# Cost pattern: NO NAT gateways (~$35/mo each saved); run Fargate tasks in PUBLIC
# subnets with tight security groups (ingress only from the ALB SG), and add VPC
# endpoints (ECR, S3, Logs, Secrets Manager) later if tasks move private.
#
# module "vpc" {
#   source  = "terraform-aws-modules/vpc/aws"
#   version = "~> 5.0"
#
#   name = local.prefix
#   cidr = "10.0.0.0/16"
#
#   azs             = ["${data.aws_region.current.region}a", "${data.aws_region.current.region}b"]
#   public_subnets  = ["10.0.0.0/20", "10.0.16.0/20"]
#   private_subnets = ["10.0.128.0/20", "10.0.144.0/20"] # RDS subnet group only
#
#   enable_nat_gateway = false
#   tags               = local.tags
# }

# TODO(Phase 1): ALB + ECS cluster/services — consider ECS Express Mode to collapse
# the ALB/service/task boilerplate. CRITICAL: ALB idle_timeout MUST be >= 200 —
# the AI extraction endpoints run up to 180s and must NOT be retried mid-flight
# (a retry would double Anthropic spend and can double-import documents).
#
# resource "aws_lb" "main" {
#   name               = local.prefix
#   load_balancer_type = "application"
#   subnets            = module.vpc.public_subnets
#   idle_timeout       = 200 # >= extraction ceiling of 180s — do not lower
# }
#
# resource "aws_ecs_cluster" "main" {
#   name = local.prefix
# }
#
# One aws_ecs_service + aws_ecs_task_definition per entry in local.services
# (Fargate, images from aws_ecr_repository.service, logs to
# aws_cloudwatch_log_group.service, secrets from aws_secretsmanager_secret.app).

# TODO(Phase 1): CloudFront + WAF — SPA served from a private S3 bucket via OAC;
# behavior /api/* -> ALB origin (long origin-response timeout for extraction);
# WAF with AWS managed rule groups (CommonRuleSet, KnownBadInputs) attached to
# the distribution.
#
# resource "aws_cloudfront_distribution" "web" { ... }
# resource "aws_wafv2_web_acl" "web" { scope = "CLOUDFRONT" ... } # must be created in us-east-1

# TODO(Phase 1): GuardDuty Malware Protection for S3 on the documents bucket —
# scans land-deed/ID uploads before extraction touches them.
#
# resource "aws_guardduty_malware_protection_plan" "documents" {
#   role = aws_iam_role.guardduty_malware.arn
#   protected_resource {
#     s3_bucket {
#       bucket_name = aws_s3_bucket.documents.id
#     }
#   }
#   actions {
#     tagging {
#       status = "ENABLED" # tag objects with scan result; enforce via bucket policy
#     }
#   }
# }

# TODO(Phase 1): Route53 + ACM — hosted zone + records for web/api. NOTE: the
# certificate attached to CloudFront MUST be issued in us-east-1 (separate
# aliased provider); the ALB certificate lives in ap-south-1.
#
# resource "aws_acm_certificate" "cloudfront" {
#   provider          = aws.us_east_1
#   domain_name       = "app.example.com"
#   validation_method = "DNS"
# }
