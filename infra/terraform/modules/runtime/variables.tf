variable "app_name" {
  description = "Application name. Prefixes every resource."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod). Also selects the persistent state key <env>/persistent.tfstate."
  type        = string
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}

# --- Remote state (persistent layer) ---

variable "tf_state_bucket" {
  description = "S3 bucket holding Terraform state (pattadar-terraform-state-<ACCOUNT_ID>)."
  type        = string
}

variable "tf_state_region" {
  description = "Region of the Terraform state bucket."
  type        = string
  default     = "ap-south-1"
}

# --- Domains / DNS ---

variable "web_domain" {
  description = "Apex domain the SPA is served on (CloudFront aliases: apex + www)."
  type        = string
  default     = "pattadar.com"
}

variable "api_domain" {
  description = "Hostname of the ALB (direct API + cron target). Dev in the shared zone should override, e.g. api-dev.pattadar.com."
  type        = string
  default     = "api.pattadar.com"
}

variable "route53_zone_id" {
  description = "Override for the hosted-zone id. Only needed when this env's persistent layer has manage_dns = false (shared-account dev) — pass the owning env's zone id."
  type        = string
  default     = ""
}

# --- Networking ---

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

# --- ECS ---

variable "task_cpu" {
  description = "Fargate task CPU units per service."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory (MiB) per service."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired task count per service."
  type        = number
  default     = 1
}

variable "gateway_image_tag" {
  description = "Image tag deployed for the gateway service (ECR repo from persistent)."
  type        = string
  default     = "latest"
}

variable "api_image_tag" {
  description = "Image tag deployed for the api service (ECR repo from persistent)."
  type        = string
  default     = "latest"
}

# --- RDS ---

variable "db_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "17"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage (GiB, gp3)."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "pattadar"
}

variable "db_username" {
  description = "Master username (password RDS-managed in Secrets Manager)."
  type        = string
  default     = "pattadar_admin"
}

variable "deletion_protection" {
  description = "RDS deletion protection. Stays true in normal operation; scripts/platform-down.sh flips it to false (targeted apply) right before destroying the runtime layer."
  type        = bool
  default     = true
}

variable "final_snapshot_suffix" {
  description = "Suffix of the RDS final snapshot id (pattadar-<env>-pg-final-<suffix>). platform-down.sh passes a timestamp so repeated down/up cycles never collide on the snapshot name."
  type        = string
  default     = "manual"
}

variable "restore_snapshot_identifier" {
  description = "When set, the RDS instance is restored from this snapshot instead of being created empty. platform-up.sh passes the latest final snapshot on re-up."
  type        = string
  default     = ""
}

# --- Scheduler ---

variable "api_base_url" {
  description = "Base URL the inactivity-check cron POSTs to. Must resolve to the ALB (api record in the persistent zone)."
  type        = string
  default     = "https://api.pattadar.com"
}

# --- Observability ---

variable "log_retention_days" {
  description = "CloudWatch log retention per service log group (prod 365, dev 30)."
  type        = number
  default     = 365
}

variable "alert_email" {
  description = "Email subscribed to the alarms SNS topic. NOTE: SNS email subscriptions require clicking the confirmation link AWS sends after apply."
  type        = string
  default     = "sankara.telukutla@gmail.com"
}

# --- CloudFront / WAF ---

variable "enable_cdn" {
  description = "Create the SPA bucket + CloudFront distribution + apex/www records. Prod true; dev false (dev serves the SPA locally and talks straight to the ALB)."
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "Attach a WAFv2 web ACL to the CloudFront distribution (only effective when enable_cdn = true)."
  type        = bool
  default     = true
}

variable "waf_block_mode" {
  description = "true = managed rule groups block; false = count-only (observe without blocking, e.g. during initial tuning)."
  type        = bool
  default     = true
}

variable "cloudfront_origin_read_timeout" {
  description = <<-EOT
    CloudFront origin response timeout (seconds) for the /api/* behavior.
    INVARIANT TENSION: AI extraction runs up to 180s, but the CloudFront
    default service quota caps this at 60. Request a quota increase for
    "Response timeout per origin" and raise this to 180. Until then, the SPA
    must call long-running extraction endpoints on https://<api_domain>
    directly (ALB idle_timeout is 200) — TODO(Phase 2).
  EOT
  type        = number
  default     = 60
}

variable "assistant_image_tag" {
  description = "Image tag for the assistant service."
  type        = string
  default     = "v1"
}
