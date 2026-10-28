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
  description = "Public API name on the api CloudFront distribution (iOS/Expo API + cron target). Dev in the shared zone should override, e.g. api-dev.pattadar.com."
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

variable "instance_type" {
  description = "ECS host instance type (arm64). t4g.medium holds the three 1 GiB tasks; t4g.small cannot."
  type        = string
  default     = "t4g.medium"
}

variable "task_cpu" {
  description = "Per-task CPU units on the shared ECS host (a hard cgroup limit; three tasks must fit the instance)."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Per-task hard memory limit (MiB) on the shared ECS host, so one service's OOM cannot take the others down."
  type        = number
  default     = 1024
}

variable "api_task_memory" {
  description = "The api task's hard memory limit (MiB) when it must differ from task_memory: the Hydrogeology reading peaks at ~0.95 GiB in its child process. null = task_memory."
  type        = number
  default     = null
}

variable "desired_count" {
  description = "Desired task count per service."
  type        = number
  default     = 1
}

variable "web_desired_count" {
  description = "UNUSED: the web ECS service was removed with the ALB (Reddy, 26/10/2026); kept until the web_* cleanup."
  type        = number
  default     = 0
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
  description = "Base URL the inactivity-check cron POSTs to. Must resolve to the api CloudFront distribution (api record in the persistent zone)."
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
  description = "Create the SPA bucket + CloudFront distribution + apex/www records. Prod true; dev false (dev serves the SPA locally and talks to the api distribution)."
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
    CloudFront origin response timeout (seconds) for the VPC origins on the
    ECS host. 120 now; 180 after the "Response timeout per origin" quota
    request. With the ALB gone this bounds the older synchronous readings
    (iOS passbook, Expo passbook/deed) against the model's 170 s budget, so
    raising it is a cutover gate; new long work uses durable async jobs.
  EOT
  type        = number
  default     = 120
}

variable "assistant_image_tag" {
  description = "Image tag for the assistant service."
  type        = string
  default     = "v1"
}

variable "web_image_tag" {
  description = "UNUSED: the web ECS task definition was removed with the ALB (Reddy, 26/10/2026); kept until the web_* cleanup."
  type        = string
  default     = "latest"
}

# --- Web origin switch ------------------------------------------------------

variable "web_origin" {
  description = <<-EOT
    Which origin CloudFront's DEFAULT behavior serves the site from:
      "spa" — the static Vite SPA in the S3 bucket (current live posture).
      "ecs" — the Next.js app on the web ECS service, via the ALB origin.
    Must stay "spa": the web service and the ALB were removed (Reddy,
    26/10/2026), so "ecs" has nothing behind it.
  EOT
  type        = string
  default     = "spa"

  validation {
    condition     = contains(["spa", "ecs"], var.web_origin)
    error_message = "web_origin must be \"spa\" or \"ecs\"."
  }
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

variable "platform_admin_uids" {
  description = "API uids (subject_ principals in AWS) bootstrapped as admins (PLATFORM_ADMIN_UIDS): the desk and the Administration rail group."
  type        = list(string)
  default     = []
}

variable "super_admin_uids" {
  description = "API uids (subject_ principals in AWS) bootstrapped as super-admins (SUPER_ADMIN_UIDS): catalogue, compliance, Intelligence, geography."
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

# --- Aadhaar field-encryption rollout ---------------------------------------

variable "aadhaar_kms_writes_enabled" {
  description = "Enable new direct-KMS Aadhaar/candidate writes. Keep false ONLY while enable_aadhaar_legacy_fernet carries the writes instead."
  type        = bool
  default     = true
}

variable "enable_aadhaar_legacy_fernet" {
  description = "Inject the approved legacy Fernet key and permit temporary bridge writes. Enable only while inventoried legacy ciphertext remains."
  type        = bool
  default     = false
}

# With neither flag set the api starts but raises on every Aadhaar write — KYC
# saves, member saves and extractions all fail after the provider has been
# billed. The api asserts this at startup too; catching it at plan time means
# it never reaches a task definition.
check "aadhaar_has_a_write_path" {
  assert {
    condition     = var.aadhaar_kms_writes_enabled || var.enable_aadhaar_legacy_fernet
    error_message = "No Aadhaar write path enabled: set aadhaar_kms_writes_enabled (preferred) or enable_aadhaar_legacy_fernet."
  }
}
