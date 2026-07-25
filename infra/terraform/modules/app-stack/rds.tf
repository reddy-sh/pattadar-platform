# PostgreSQL 17. Master password is generated and rotated by RDS itself
# (manage_master_user_password) and stored in Secrets Manager under the CMK.
#
# Until the Phase 1 VPC exists, db_subnet_group_name is null and the instance
# lands in the default VPC (private, publicly_accessible = false).

resource "aws_db_instance" "main" {
  identifier = "${local.prefix}-pg"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username

  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.main.arn

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.main.arn

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = var.db_vpc_security_group_ids
  publicly_accessible    = false
  multi_az               = false # TODO(Phase 2): enable for production HA once traffic justifies the cost.

  backup_retention_period    = 7
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.prefix}-pg-final"
  auto_minor_version_upgrade = true

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = local.tags
}
