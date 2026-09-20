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

variable "enforce_documents_sse_kms_headers" {
  description = <<-EOT
    Deny document PutObject requests that omit the explicit SSE-KMS headers for
    the app CMK. Defence in depth only — the bucket already applies SSE-KMS with
    that key by default, so flipping this changes nothing about how objects are
    encrypted, it only rejects writers that do not say so.

    Enabling it is a SEPARATE, REVIEWED apply that must land AFTER every writer
    revision is deployed, because the deny hits mixed/old tasks immediately.
    Writers audited 2026-09-19, all sending ServerSideEncryption=aws:kms +
    SSEKMSKeyId: services/gateway/src/storage.py (_put_args, unless the
    local-only PATTADAR_ALLOW_UNENCRYPTED_LOCAL escape is set),
    services/assistant/src/adapters/attachment_store.py and
    services/assistant/scripts/migrate_attachments.py. GuardDuty's malware-plan
    validation object (guardduty.tf) relies on bucket default encryption and
    sends no headers — confirm the plan still validates after the flip.
  EOT
  type        = bool
  default     = false
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

# --- Audit trail ---

variable "cloudtrail_object_lock_retention_days" {
  description = "Object Lock GOVERNANCE retention on new CloudTrail objects. Must stay below the bucket's 400-day expiry or the lifecycle rule cannot delete them. GOVERNANCE (not COMPLIANCE) so a DPDP erasure order stays executable by a principal holding s3:BypassGovernanceRetention."
  type        = number
  default     = 365

  validation {
    condition     = var.cloudtrail_object_lock_retention_days > 0 && var.cloudtrail_object_lock_retention_days < 400
    error_message = "cloudtrail_object_lock_retention_days must be between 1 and 399 — the CloudTrail bucket expires objects at 400 days and a longer lock would make that lifecycle rule permanently fail."
  }
}

variable "trail_documents_data_events" {
  description = "Record S3 object-level WRITE events (PutObject, DeleteObject, ...) on the documents bucket in CloudTrail. Reads stay out: S3 server access logging already covers them, and data events are billed per event."
  type        = bool
  default     = true
}

# --- Container registry ---

variable "ecr_keep_last_images" {
  description = "Number of images retained per ECR repository."
  type        = number
  default     = 10
}

variable "ecr_untagged_expiry_days" {
  description = "Days an untagged image layer survives before expiry. Untagged images are swept first so they do not consume the ecr_keep_last_images budget and push a still-referenced release image out of the registry."
  type        = number
  default     = 14
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
  description = "OAuth callback URLs for the SPA app client (hosted-UI code flow). Production client: https only — loopback spellings belong on the local-dev client below."
  type        = list(string)
  default     = ["https://pattadar.com/auth/callback"]
}

variable "spa_logout_urls" {
  description = "Allowed sign-out redirect URLs for the SPA app client."
  type        = list(string)
  default     = ["https://pattadar.com/"]
}

# --- Cognito local-dev client ---
# A second public client on the SAME pool, so a laptop keeps the pool's Google
# IdP and real users while the production SPA client stays https-only. Its
# id is `cognito_local_dev_client_id` (VITE_COGNITO_CLIENT_ID for local runs).

variable "enable_local_dev_client" {
  description = "Create a loopback-callback app client for local development. Enable in the env whose pool developers sign in against; the dev env's own SPA client already carries loopback URLs."
  type        = bool
  default     = false
}

variable "local_dev_callback_urls" {
  description = "OAuth callback URLs for the local-dev app client."
  type        = list(string)
  # Cognito matches redirect_uri byte-for-byte, and the SPA sends its
  # browsing origin — so localhost and 127.0.0.1 are DIFFERENT callbacks.
  # A dev tab opened on 127.0.0.1:5173 died on redirect_mismatch until both
  # loopback spellings were registered (http is only allowed on loopback,
  # so this widens nothing for the internet).
  default = [
    "http://localhost:5173/auth/callback",
    "http://127.0.0.1:5173/auth/callback",
    "http://localhost:5180/auth/callback",
    "http://127.0.0.1:5180/auth/callback",
  ]
}

variable "local_dev_logout_urls" {
  description = "Allowed sign-out redirect URLs for the local-dev app client."
  type        = list(string)
  default = [
    "http://localhost:5173/",
    "http://127.0.0.1:5173/",
    "http://localhost:5180/",
    "http://127.0.0.1:5180/",
  ]
}

# --- CI / deploy ---

variable "github_repository" {
  description = "GitHub repository (owner/name) trusted by the OIDC deploy role."
  type        = string
  default     = "reddy-sh/pattadar-platform"
}

# Read with:
#   gh api /users/reddy-sh --jq .id
#   gh api /repos/reddy-sh/pattadar-platform --jq .id
variable "github_owner_id" {
  description = "Numeric GitHub owner id. Empty falls the immutable OIDC subject back to an owner@*/repo@* wildcard, which is trust-by-name only — a deleted-and-resquatted repo would still be trusted."
  type        = string
  default     = "204504651"
}

variable "github_repository_id" {
  description = "Numeric GitHub repository id. Empty falls the immutable OIDC subject back to an owner@*/repo@* wildcard, which is trust-by-name only."
  type        = string
  default     = "1311998193"
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
  description = "Create the shared ECR repositories (pattadar/api|gateway|assistant|web). Repo names carry no env segment — exactly one env per account owns them; dev in a shared account sets false and reuses prod's."
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

variable "custom_auth_domain" {
  description = "Custom Cognito hosted-UI domain (e.g. auth.pattadar.com) — customers must never see amazoncognito.com. Empty = prefix domain only. Requires manage_dns = true and the parent apex to resolve."
  type        = string
  default     = ""
}
