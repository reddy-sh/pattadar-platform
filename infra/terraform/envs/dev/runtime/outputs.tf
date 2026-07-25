# Root-level re-exports for scripts/platform-up.sh, deploy.yml and runbooks.

output "alb_dns_name" {
  value = module.runtime.alb_dns_name
}

output "cloudfront_domain_name" {
  value = module.runtime.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  value = module.runtime.cloudfront_distribution_id
}

output "spa_bucket_name" {
  value = module.runtime.spa_bucket_name
}

output "rds_endpoint" {
  value = module.runtime.rds_endpoint
}

output "rds_master_secret_arn" {
  value = module.runtime.rds_master_secret_arn
}

output "db_dsn_secret_arn" {
  value = module.runtime.db_dsn_secret_arn
}

output "ecs_cluster_name" {
  value = module.runtime.ecs_cluster_name
}

output "ecs_service_names" {
  value = module.runtime.ecs_service_names
}
