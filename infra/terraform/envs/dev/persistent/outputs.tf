# Root-level re-exports — the dev runtime layer reads these via
# terraform_remote_state (key dev/persistent.tfstate). Singleton outputs are
# null when the corresponding manage_* flag is false.

output "kms_key_arn" {
  value = module.persistent.kms_key_arn
}

output "documents_bucket_name" {
  value = module.persistent.documents_bucket_name
}

output "documents_bucket_arn" {
  value = module.persistent.documents_bucket_arn
}

output "access_logs_bucket_name" {
  value = module.persistent.access_logs_bucket_name
}

output "cloudtrail_bucket_name" {
  value = module.persistent.cloudtrail_bucket_name
}

output "parking_storage_class" {
  value = module.persistent.parking_storage_class
}

output "ecr_repository_urls" {
  value = module.persistent.ecr_repository_urls
}

output "secret_arns" {
  value = module.persistent.secret_arns
}

output "cognito_user_pool_id" {
  value = module.persistent.cognito_user_pool_id
}

output "cognito_user_pool_arn" {
  value = module.persistent.cognito_user_pool_arn
}

output "cognito_spa_client_id" {
  value = module.persistent.cognito_spa_client_id
}

output "cognito_mobile_client_id" {
  value = module.persistent.cognito_mobile_client_id
}

output "cognito_issuer" {
  value = module.persistent.cognito_issuer
}

output "cognito_hosted_ui_domain" {
  value = module.persistent.cognito_hosted_ui_domain
}

output "route53_zone_id" {
  value = module.persistent.route53_zone_id
}

output "route53_name_servers" {
  value = module.persistent.route53_name_servers
}

output "ses_identity_arn" {
  value = module.persistent.ses_identity_arn
}

output "github_deploy_role_arn" {
  value = module.persistent.github_deploy_role_arn
}
