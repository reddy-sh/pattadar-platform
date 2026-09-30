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
  # Phase 2 only: flip in a separately approved plan after gateway, assistant,
  # and migration writers all prove explicit SSE-KMS headers.
  enforce_documents_sse_kms_headers = false

  # PINNED DELIBERATELY. The module default is the single element
  # ["https://pattadar.com/auth/callback"], and platform-up.sh applies this
  # layer with -auto-approve — so leaving these unset silently DELETES every
  # other registered callback on the next apply. The account signs in through
  # Google federation, so a deleted callback is not recoverable with a
  # password.
  #
  # BEFORE THE NEXT APPLY: reconcile this list against the live pool
  #   aws cognito-idp describe-user-pool-client \
  #     --user-pool-id <pool> --client-id <spa client> \
  #     --query 'UserPoolClient.[CallbackURLs,LogoutURLs]'
  # and add anything registered by hand that is still in use. Read the plan;
  # a removal shows up as a change to this list.
  #
  # Loopback spellings live on the local-dev client, not here: the production
  # client stays https-only.
  spa_callback_urls = ["https://pattadar.com/auth/callback"]
  spa_logout_urls   = ["https://pattadar.com/"]

  # Gives local development its own client rather than borrowing the
  # production one. NOTE: this mints a NEW client id — after the apply, local
  # runs must set VITE_COGNITO_CLIENT_ID to the `cognito_local_dev_client_id`
  # output. Until they do, a local sign-in against the old id fails, because
  # the loopback URLs moved off the SPA client in the same change.
  enable_local_dev_client = true

  # Browser origins allowed to POST a presigned upload form at the documents
  # bucket. Add platform./university. here in the same change that gives them
  # DNS — not after.
  documents_cors_origins = ["https://pattadar.com"]
}
