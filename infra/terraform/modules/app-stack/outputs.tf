output "kms_key_arn" {
  description = "ARN of the app CMK."
  value       = aws_kms_key.main.arn
}

output "documents_bucket_name" {
  description = "Name of the documents bucket."
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the documents bucket."
  value       = aws_s3_bucket.documents.arn
}

output "access_logs_bucket_name" {
  description = "Name of the S3 access-logs bucket."
  value       = aws_s3_bucket.logs.id
}

output "ecr_repository_urls" {
  description = "Map of service name -> ECR repository URL."
  value       = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "db_endpoint" {
  description = "RDS endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "db_master_user_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master password."
  value       = one(aws_db_instance.main.master_user_secret[*].secret_arn)
}

output "secret_arns" {
  description = "Map of logical secret name -> Secrets Manager ARN (values filled out-of-band)."
  value       = { for k, s in aws_secretsmanager_secret.app : k => s.arn }
}

output "log_group_names" {
  description = "Map of service name -> CloudWatch log group name."
  value       = { for k, g in aws_cloudwatch_log_group.service : k => g.name }
}

output "alarms_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms."
  value       = aws_sns_topic.alarms.arn
}
