variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "api_base_url" {
  description = "Public base URL of the dev api service (no trailing slash)."
  type        = string
  default     = "https://api.invalid.example.com" # TODO(Phase 1): real dev hostname.
}

variable "cron_secret_header_value" {
  description = "x-cron-secret header value. Supply at apply time from the pattadar/dev/cron-secret Secrets Manager secret — never commit it."
  type        = string
  sensitive   = true
  default     = "REPLACE_AT_APPLY_TIME"
}
