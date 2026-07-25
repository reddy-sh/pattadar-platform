variable "app_name" {
  description = "Application name. Prefixes every resource so the module can be instantiated once per app."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, prod)."
  type        = string
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}

# --- Database ---

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB (gp3)."
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "PostgreSQL engine version. Major-only value lets auto minor upgrades track patches."
  type        = string
  default     = "17"
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "pattadar"
}

variable "db_username" {
  description = "Master username. Password is generated and stored by RDS in Secrets Manager (manage_master_user_password)."
  type        = string
  default     = "pattadar_admin"
}

variable "db_subnet_group_name" {
  description = "DB subnet group. Null until the Phase 1 VPC exists, which places the instance in the default VPC. TODO(Phase 1): require this once the VPC module is enabled."
  type        = string
  default     = null
}

variable "db_vpc_security_group_ids" {
  description = "Security groups for the DB instance. Empty until the Phase 1 VPC exists."
  type        = list(string)
  default     = []
}

# --- Storage ---

variable "noncurrent_version_expiration_days" {
  description = "Days after which noncurrent object versions in the documents bucket expire."
  type        = number
  default     = 180
}

# --- Observability ---

variable "log_retention_days" {
  description = "CloudWatch log group retention. 365 days supports the 1-year SOC 2 / DPDP retention baseline."
  type        = number
  default     = 365
}

# --- Scheduler / cron ---

variable "api_base_url" {
  description = "Public base URL of the api service (no trailing slash), e.g. https://api.pattadar.example.com. Target of the daily inactivity-check schedule."
  type        = string
  default     = "https://api.invalid.example.com" # TODO(Phase 1): set to the real ALB/CloudFront hostname.
}

variable "cron_secret_header_value" {
  description = "Value sent as the x-cron-secret header by the EventBridge connection. Supply at apply time from the cron-secret Secrets Manager secret (e.g. -var or TF_VAR_ sourced via aws secretsmanager get-secret-value); never commit it."
  type        = string
  sensitive   = true
  default     = "REPLACE_AT_APPLY_TIME"
}

# --- Container registry ---

variable "ecr_keep_last_images" {
  description = "Number of images retained per ECR repository."
  type        = number
  default     = 10
}
