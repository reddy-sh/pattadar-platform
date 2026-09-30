terraform {
  backend "s3" {
    bucket       = "pattadar-terraform-state-222634365368"
    key          = "prod/university.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
