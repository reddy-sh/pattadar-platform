# Consumed by scripts/platform-up.sh (health checks), deploy.yml (SPA sync +
# CloudFront invalidation + release templates) and the runbooks.

output "alb_dns_name" {
  description = "ALB DNS name (api.<domain> aliases here)."
  value       = aws_lb.main.dns_name
}

output "task_definition_arns" {
  description = "Terraform template task-definition revisions per service; deploy-release.py --templates builds each release from these."
  value = {
    gateway   = aws_ecs_task_definition.gateway.arn
    api       = aws_ecs_task_definition.api.arn
    assistant = aws_ecs_task_definition.assistant.arn
  }
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain (null when enable_cdn = false)."
  value       = one(aws_cloudfront_distribution.web[*].domain_name)
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id for cache invalidations (null when enable_cdn = false)."
  value       = one(aws_cloudfront_distribution.web[*].id)
}

output "spa_bucket_name" {
  description = "SPA bucket the built web app is synced to (null when enable_cdn = false)."
  value       = one(aws_s3_bucket.spa[*].id)
}
output "village_maps_origin_enabled" {
  description = "Whether CloudFront routes /vm/* to the persistent village-maps bucket."
  value       = local.vm_enabled
}

output "rds_endpoint" {
  description = "RDS endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "rds_master_secret_arn" {
  description = "ARN of the RDS-managed master-password secret."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "db_app_password_parameter_name" {
  description = "Out-of-band SSM SecureString the services read as PG_PASSWORD (name only; the value never enters state)."
  value       = "/${var.app_name}/${var.environment}/db-app-password"
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "ECS service names (for aws ecs update-service --force-new-deployment)."
  value       = [aws_ecs_service.gateway.name, aws_ecs_service.api.name, aws_ecs_service.assistant.name]
}
