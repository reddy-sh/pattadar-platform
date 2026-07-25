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

# Prod owns the account singletons (hosted zone + SES, GitHub OIDC,
# CloudTrail/Config/GuardDuty) — the manage_* flags default to true.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

module "persistent" {
  source = "../../../modules/persistent"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  app_name           = "pattadar"
  environment        = "prod"
  custom_auth_domain = "auth.pattadar.com"
  enable_google_idp  = true

  noncurrent_version_expiration_days = var.noncurrent_version_expiration_days
  parking_storage_class              = var.parking_storage_class
}
