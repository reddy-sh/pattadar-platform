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

# --- Storage ---

variable "noncurrent_version_expiration_days" {
  description = "Days after which noncurrent object versions in the documents bucket expire."
  type        = number
  default     = 180
}

variable "parking_storage_class" {
  description = <<-EOT
    S3 storage class the documents bucket contents are transitioned to when the
    environment is PARKED (platform-down). Terraform declares it as the single
    source of truth but does NOT consume it — scripts/platform-down.sh reads it
    from `terraform output parking_storage_class` and performs the transition.
    DEEP_ARCHIVE is cheapest (12h retrieval); GLACIER_IR restores in
    milliseconds at ~4x the storage cost.
  EOT
  type        = string
  default     = "DEEP_ARCHIVE"

  validation {
    condition     = contains(["DEEP_ARCHIVE", "GLACIER_IR"], var.parking_storage_class)
    error_message = "parking_storage_class must be DEEP_ARCHIVE or GLACIER_IR."
  }
}

# --- Container registry ---

variable "ecr_keep_last_images" {
  description = "Number of images retained per ECR repository."
  type        = number
  default     = 10
}

# --- Domain / email ---

variable "domain_name" {
  description = "Apex domain served by the platform. The hosted zone, SES identity and DKIM/DMARC records are created for this domain."
  type        = string
  default     = "pattadar.com"
}

variable "dmarc_rua_email" {
  description = "Mailbox receiving DMARC aggregate reports (rua=mailto:...)."
  type        = string
  default     = "sankara.telukutla@gmail.com"
}

# --- Cognito SPA client ---

variable "spa_callback_urls" {
  description = "OAuth callback URLs for the SPA app client (hosted-UI code flow)."
  type        = list(string)
  default = [
    "https://pattadar.com/auth/callback",
    "http://localhost:5173/auth/callback",
  ]
}

variable "spa_logout_urls" {
  description = "Allowed sign-out redirect URLs for the SPA app client."
  type        = list(string)
  default = [
    "https://pattadar.com/",
    "http://localhost:5173/",
  ]
}

# --- CI / deploy ---

variable "github_repository" {
  description = "GitHub repository (owner/name) trusted by the OIDC deploy role."
  type        = string
  default     = "reddy-sh/pattadar-platform"
}

# --- Account-singleton toggles ---
# The three groups below are one-per-account (OIDC provider, IAM role name,
# GuardDuty detector, Config recorder) or one-per-domain (hosted zone, SES
# identity). When dev and prod share a single AWS account, exactly ONE env
# (prod) must manage them — set these to false in the other env.

variable "manage_github_oidc" {
  description = "Create the GitHub OIDC provider + pattadar-github-deploy role. Account singleton: enable in exactly one env per AWS account."
  type        = bool
  default     = true
}

variable "manage_dns" {
  description = "Create the Route53 hosted zone + SES identity/DKIM/MAIL FROM/DMARC records. Domain singleton: enable in exactly one env per AWS account."
  type        = bool
  default     = true
}

variable "manage_org_security" {
  description = "Create CloudTrail (trail + bucket), AWS Config recorder and GuardDuty (detector + S3 malware protection). Account/region singletons: enable in exactly one env per AWS account."
  type        = bool
  default     = true
}

variable "manage_ecr" {
  description = "Create the shared ECR repositories (pattadar/api|gateway|assistant). Repo names carry no env segment — exactly one env per account owns them; dev in a shared account sets false and reuses prod's."
  type        = bool
  default     = true
}

# Social sign-in providers — flip to true AFTER filling the matching keys in
# the <app>/<env>/idp-social secret (founder creates the apps in the Google /
# Meta / Apple developer consoles; Cognito redirect URI for all three:
# https://pattadar-auth-<env>.auth.ap-south-1.amazoncognito.com/oauth2/idpresponse).
variable "enable_google_idp" {
  type    = bool
  default = false
}

variable "enable_facebook_idp" {
  type    = bool
  default = false
}

variable "enable_apple_idp" {
  type    = bool
  default = false
}
