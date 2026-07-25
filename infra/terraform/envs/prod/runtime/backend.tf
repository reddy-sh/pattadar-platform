# Same state bucket as the persistent roots, distinct key. Bootstrap commands
# live in envs/prod/persistent/backend.tf.

terraform {
  backend "s3" {
    bucket       = "pattadar-terraform-state-222634365368"
    key          = "prod/runtime.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true # native S3 locking, TF >= 1.10
  }
}