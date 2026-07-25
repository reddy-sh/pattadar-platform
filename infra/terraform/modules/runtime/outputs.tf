# Consumed by scripts/platform-up.sh (health checks), deploy.yml (SPA sync +
# CloudFront invalidation + service redeploys) and the runbooks.

output "alb_dns_name" {
  description = "ALB DNS name (api.<domain> aliases here)."
  value       = aws_lb.main.dns_name
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

output "rds_endpoint" {
  description = "RDS endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "rds_master_secret_arn" {
  description = "ARN of the RDS-managed master-password secret."
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "db_dsn_secret_arn" {
  description = "ARN of the composed pattadar/<env>/db-dsn runtime secret (APP_PG_DSN)."
  value       = aws_secretsmanager_secret.db_dsn.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_names" {
  description = "ECS service names (for aws ecs update-service --force-new-deployment)."
  value       = [aws_ecs_service.gateway.name, aws_ecs_service.api.name]
}
