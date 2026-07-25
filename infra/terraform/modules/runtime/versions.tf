# The us_east_1 alias exists solely for CloudFront-scoped resources (ACM cert,
# WAFv2 CLOUDFRONT web ACL) — both are us-east-1-only APIs. Env roots define
# the aliased provider and pass it in via the module `providers` map.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
