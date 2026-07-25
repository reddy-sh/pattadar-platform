terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "pattadar-platform"
      Environment = "prod"
    }
  }
}

# CloudFront-scoped resources (ACM cert, WAF web ACL) must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "pattadar-platform"
      Environment = "prod"
    }
  }
}

# The dev and prod runtime roots are intentionally identical except for the
# environment literal, the backend key and the tfvars.
module "runtime" {
  source = "../../../modules/runtime"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  app_name    = "pattadar"
  environment = "prod"

  tf_state_bucket = var.tf_state_bucket
  tf_state_region = var.region

  route53_zone_id = var.route53_zone_id
  api_domain      = var.api_domain
  api_base_url    = var.api_base_url

  gateway_image_tag = var.gateway_image_tag

  assistant_image_tag = var.assistant_image_tag
  api_image_tag       = var.api_image_tag
  desired_count       = var.desired_count

  deletion_protection         = var.deletion_protection
  final_snapshot_suffix       = var.final_snapshot_suffix
  restore_snapshot_identifier = var.restore_snapshot_identifier

  log_retention_days = var.log_retention_days
  alert_email        = var.alert_email

  enable_cdn                     = var.enable_cdn
  enable_waf                     = var.enable_waf
  waf_block_mode                 = var.waf_block_mode
  cloudfront_origin_read_timeout = var.cloudfront_origin_read_timeout
}
