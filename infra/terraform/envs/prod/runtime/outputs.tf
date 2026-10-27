# Root-level re-exports for scripts/platform-up.sh, deploy.yml and runbooks.

output "api_domain" {
  value = module.runtime.api_domain
}

output "host_instance_id" {
  value = module.runtime.host_instance_id
}

output "task_definition_arns" {
  value = module.runtime.task_definition_arns
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

output "db_app_password_parameter_name" {
  value = module.runtime.db_app_password_parameter_name
}

output "ecs_cluster_name" {
  value = module.runtime.ecs_cluster_name
}

output "ecs_service_names" {
  value = module.runtime.ecs_service_names
}
output "village_maps_origin_enabled" {
  value = module.runtime.village_maps_origin_enabled
}
