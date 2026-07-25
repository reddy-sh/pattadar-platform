# Same bootstrap as envs/prod/persistent/backend.tf — shared state bucket,
# distinct key.

# terraform {
#   backend "s3" {
#     bucket       = "pattadar-terraform-state-<ACCOUNT_ID>"
#     key          = "dev/persistent.tfstate"
#     region       = "ap-south-1"
#     encrypt      = true
#     use_lockfile = true # native S3 locking, TF >= 1.10
#   }
# }
