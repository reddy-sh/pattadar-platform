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

# Thin variant of prod: same module, shorter retentions, localhost-only auth
# callbacks. If dev shares the prod AWS account, set the manage_* flags to
# false (dev.auto.tfvars) — prod owns the account singletons (hosted zone,
# SES, GitHub OIDC, CloudTrail/Config/GuardDuty) and dev reuses the shared
# ECR repositories.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "persistent" {
  source = "../../../modules/persistent"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  app_name    = "pattadar"
  environment = "dev"

  noncurrent_version_expiration_days = 30
  parking_storage_class              = var.parking_storage_class

  spa_callback_urls = ["http://localhost:5173/auth/callback", "http://127.0.0.1:5173/auth/callback"]
  spa_logout_urls   = ["http://localhost:5173/", "http://127.0.0.1:5173/"]

  manage_dns          = var.manage_dns
  manage_github_oidc  = var.manage_github_oidc
  manage_org_security = var.manage_org_security
  manage_ecr          = var.manage_ecr
}
