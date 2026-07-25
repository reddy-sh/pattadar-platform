variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "api_base_url" {
  description = "Public base URL of the api service (no trailing slash)."
  type        = string
  default     = "https://api.invalid.example.com" # TODO(Phase 1): real hostname once ALB/CloudFront exist.
}

variable "cron_secret_header_value" {
  description = "x-cron-secret header value. Supply at apply time from the pattadar/prod/cron-secret Secrets Manager secret — never commit it."
  type        = string
  sensitive   = true
  default     = "REPLACE_AT_APPLY_TIME"
}
