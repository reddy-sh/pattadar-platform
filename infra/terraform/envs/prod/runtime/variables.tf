# Pass-throughs to modules/runtime — defaults here are the PROD posture; the
# dev root carries the same variables and overrides via dev.auto.tfvars.

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "tf_state_bucket" {
  description = "Terraform state bucket (pattadar-terraform-state-<ACCOUNT_ID>) — also where the persistent state is read from."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted-zone id override; only needed when this env's persistent layer has manage_dns = false."
  type        = string
  default     = ""
}

variable "api_domain" {
  description = "Public API name on the api CloudFront distribution (iOS/Expo API + cron)."
  type        = string
  default     = "api.pattadar.com"
}

variable "api_base_url" {
  description = "Base URL for the inactivity-check cron target; must resolve to the api CloudFront distribution."
  type        = string
  default     = "https://api.pattadar.com"
}

variable "gateway_image_tag" {
  description = "Gateway image tag (deploy.yml passes the pushed tag)."
  type        = string
  default     = "latest"
}

variable "api_image_tag" {
  description = "API image tag (deploy.yml passes the pushed tag)."
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "Desired task count per ECS service."
  type        = number
  default     = 1
}

variable "instance_type" {
  description = "ECS host instance type (arm64); t4g.medium holds the three 1 GiB tasks."
  type        = string
  default     = "t4g.medium"
}

variable "web_desired_count" {
  description = "UNUSED: the web ECS service was removed (Reddy, 26/10/2026); kept until the web_* cleanup."
  type        = number
  default     = 0
}

variable "deletion_protection" {
  description = "RDS deletion protection — platform-down.sh flips this to false right before destroy."
  type        = bool
  default     = true
}

variable "final_snapshot_suffix" {
  description = "Suffix of the RDS final snapshot id (platform-down.sh passes a timestamp)."
  type        = string
  default     = "manual"
}

variable "restore_snapshot_identifier" {
  description = "Restore RDS from this snapshot (platform-up.sh passes the latest final snapshot on re-up)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention. 30 pre-launch; revisit at launch (DPDP may require longer)."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Alarm email (SNS subscription needs manual confirmation)."
  type        = string
  default     = "sankara.telukutla@gmail.com"
}

variable "enable_cdn" {
  description = "Create SPA bucket + CloudFront + apex/www records."
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "Attach the WAF web ACL to CloudFront."
  type        = bool
  # Off until launch (Reddy, 25/10/2026): ~$8/month guarding a pre-launch SPA.
  # Turn back on before real users; it then covers api.pattadar.com too, so
  # add an allow rule for the exact cron path first (api_edge.tf).
  default = false
}

variable "waf_block_mode" {
  description = "true = block, false = count-only observation."
  type        = bool
  default     = true
}

variable "cloudfront_origin_read_timeout" {
  description = "Origin response timeout for the VPC origins on the ECS host. 120 now; 180 after the CloudFront \"Response timeout per origin\" quota request. It bounds the older synchronous readings (iOS passbook) now that the ALB's 200 s is gone — see infra/terraform/README.md."
  type        = number
  default     = 120
}

variable "assistant_image_tag" {
  description = "Image tag for the assistant service."
  type        = string
  default     = "v1"
}

variable "web_image_tag" {
  description = "UNUSED: the web ECS task definition was removed (Reddy, 26/10/2026); kept until the web_* cleanup."
  type        = string
  default     = "latest"
}

variable "web_origin" {
  description = "CloudFront default-behavior origin. Must stay \"spa\" (S3 SPA): the web service and ALB behind \"ecs\" were removed."
  type        = string
  default     = "spa"
}

variable "identity_legacy_bindings" {
  description = "Reviewed immutable-principal to legacy owner mapping; null blocks gateway startup until migration preflight is complete."
  type        = map(string)
  default     = null
}

variable "admin_subject_ids" {
  description = "Immutable subject_ principal IDs allowed to administer models."
  type        = list(string)
  default     = []
}

variable "payments_mode" {
  description = "Razorpay off/test/live mode. Off preserves the explicit simulated wallet."
  type        = string
  default     = "off"
  validation {
    condition     = contains(["off", "test", "live"], var.payments_mode)
    error_message = "payments_mode must be off, test or live."
  }
}

variable "razorpay_live_confirmed" {
  description = "Enable only after provider onboarding and test-mode acceptance."
  type        = bool
  default     = false
}

variable "payment_secret_arns" {
  description = "Existing Secrets Manager ARNs encrypted with the persistent CMK for Razorpay config. Values are secret ARNs, never credentials."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for key in keys(var.payment_secret_arns) : contains(["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_LINKED_ACCOUNTS_JSON"], key)])
    error_message = "Only the four documented Razorpay secret names are supported."
  }
}
