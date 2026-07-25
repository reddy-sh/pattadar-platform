variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "parking_storage_class" {
  description = "Storage class platform-down.sh parks documents in (DEEP_ARCHIVE or GLACIER_IR). Consumed by the script, not Terraform."
  type        = string
  default     = "GLACIER_IR" # dev parks/unparks often — fast restore beats cheapest storage
}

# Account singletons — set all three to false when dev shares the prod AWS
# account (prod owns them; a second copy would conflict).

variable "manage_dns" {
  description = "Create the pattadar.com hosted zone + SES identity in this env."
  type        = bool
  default     = true
}

variable "manage_github_oidc" {
  description = "Create the GitHub OIDC provider + pattadar-github-deploy role in this env."
  type        = bool
  default     = true
}

variable "manage_org_security" {
  description = "Create CloudTrail/Config/GuardDuty in this env."
  type        = bool
  default     = true
}

variable "manage_ecr" {
  description = "Create the shared ECR repositories. False when dev shares prod's account."
  type        = bool
  default     = true
}
