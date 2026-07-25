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
      Environment = "dev"
    }
  }
}

# Thin variant of prod: same module, smaller knobs.
# TODO(Phase 2): consider Aurora Serverless v2 with min capacity 0 (scale-to-zero
# between dev sessions) instead of a provisioned t4g instance — needs a module
# variant since aws_rds_cluster replaces aws_db_instance.
module "app_stack" {
  source = "../../modules/app-stack"

  app_name    = "pattadar"
  environment = "dev"

  db_instance_class                  = "db.t4g.micro"
  db_allocated_storage               = 20
  noncurrent_version_expiration_days = 30
  log_retention_days                 = 30

  api_base_url             = var.api_base_url
  cron_secret_header_value = var.cron_secret_header_value
}

output "app_stack" {
  description = "All app-stack outputs (endpoints, bucket names, repo URLs, secret ARNs)."
  value = {
    documents_bucket    = module.app_stack.documents_bucket_name
    db_endpoint         = module.app_stack.db_endpoint
    ecr_repository_urls = module.app_stack.ecr_repository_urls
    secret_arns         = module.app_stack.secret_arns
    alarms_topic_arn    = module.app_stack.alarms_topic_arn
  }
}
