# Everything the runtime layer (via terraform_remote_state) and the
# platform-up/down scripts need. Singleton-gated resources output null when
# not managed by this env.

# --- KMS ---

output "kms_key_arn" {
  description = "ARN of the app CMK."
  value       = aws_kms_key.main.arn
}

# --- S3 ---

output "documents_bucket_name" {
  description = "Name of the documents bucket."
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the documents bucket."
  value       = aws_s3_bucket.documents.arn
}

output "access_logs_bucket_name" {
  description = "Name of the S3 access-logs bucket (also CloudFront/ALB log target for runtime)."
  value       = aws_s3_bucket.logs.id
}

output "cloudtrail_bucket_name" {
  description = "Name of the CloudTrail bucket (null when manage_org_security = false)."
  value       = one(aws_s3_bucket.cloudtrail[*].id)
}

output "parking_storage_class" {
  description = "Storage class scripts/platform-down.sh transitions parked documents to."
  value       = var.parking_storage_class
}

# --- ECR ---

output "ecr_repository_urls" {
  description = "Map of service name -> ECR repository URL."
  value       = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

# --- Secrets ---

output "secret_arns" {
  description = "Map of logical secret name -> Secrets Manager ARN (values filled out-of-band)."
  value       = { for k, s in aws_secretsmanager_secret.app : k => s.arn }
}

# --- Cognito ---

output "cognito_user_pool_id" {
  description = "Cognito user pool id."
  value       = aws_cognito_user_pool.pattadar.id
}

output "cognito_user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.pattadar.arn
}

output "cognito_spa_client_id" {
  description = "SPA app client id (VITE_COGNITO_CLIENT_ID)."
  value       = aws_cognito_user_pool_client.spa.id
}

output "cognito_issuer" {
  description = "OIDC issuer URL (VITE_COGNITO_AUTHORITY)."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.pattadar.id}"
}

output "cognito_hosted_ui_domain" {
  description = "Hosted UI domain (VITE_COGNITO_DOMAIN)."
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

# --- Route53 ----------------------------------------------------------------
# NAME SERVERS: the founder needs these 4 values for the registrar NS switch
# (Track B) — `terraform output route53_name_servers`.

output "route53_zone_id" {
  description = "Hosted zone id for pattadar.com (null when manage_dns = false)."
  value       = one(aws_route53_zone.main[*].zone_id)
}

output "route53_name_servers" {
  description = "The 4 NS records to set at the registrar when cutting pattadar.com over from Azure DNS (Track B)."
  value       = one(aws_route53_zone.main[*].name_servers)
}

# --- SES ---

output "ses_identity_arn" {
  description = "SES domain identity ARN (null when manage_dns = false)."
  value       = one(aws_ses_domain_identity.main[*].arn)
}

# --- CI ---

output "github_deploy_role_arn" {
  description = "IAM role ARN GitHub Actions assumes via OIDC (null when manage_github_oidc = false)."
  value       = one(aws_iam_role.github_deploy[*].arn)
}
