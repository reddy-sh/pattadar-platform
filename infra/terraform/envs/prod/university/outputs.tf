output "university_bucket_name" {
  value = aws_s3_bucket.site.id
}

output "university_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "university_domain" {
  value = local.domain
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.university.id
}

output "cognito_issuer" {
  value = data.terraform_remote_state.persistent.outputs.cognito_issuer
}

output "cognito_hosted_ui_domain" {
  value = data.terraform_remote_state.persistent.outputs.cognito_hosted_ui_domain
}
