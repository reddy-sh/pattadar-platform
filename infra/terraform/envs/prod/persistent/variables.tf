variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "noncurrent_version_expiration_days" {
  description = "Days after which noncurrent document versions expire."
  type        = number
  default     = 180
}

variable "parking_storage_class" {
  description = "Storage class platform-down.sh parks documents in (DEEP_ARCHIVE or GLACIER_IR). Consumed by the script, not Terraform."
  type        = string
  default     = "DEEP_ARCHIVE"
}
