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

module "app_stack" {
  source = "../../modules/app-stack"

  app_name    = "pattadar"
  environment = "prod"

  db_instance_class        = var.db_instance_class
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
