# Remote state backend — S3 with native lockfile locking (Terraform >= 1.10,
# no DynamoDB table needed).
#
# Bootstrap (one-time, before the first `terraform init` here):
#   1. aws s3 mb s3://pattadar-terraform-state-<ACCOUNT_ID> --region ap-south-1
#   2. aws s3api put-bucket-versioning --bucket pattadar-terraform-state-<ACCOUNT_ID> \
#        --versioning-configuration Status=Enabled
#   3. aws s3api put-public-access-block --bucket pattadar-terraform-state-<ACCOUNT_ID> \
#        --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
#   4. Uncomment the block below, fill the bucket name, run `terraform init`.
#
# Until then, state is local (fine for a first review pass, not for real applies).

# terraform {
#   backend "s3" {
#     bucket       = "pattadar-terraform-state-<ACCOUNT_ID>"
#     key          = "envs/prod/terraform.tfstate"
#     region       = "ap-south-1"
#     encrypt      = true
#     use_lockfile = true # native S3 locking, TF >= 1.10
#   }
# }
