# PostgreSQL 17. Master password is generated and rotated by RDS itself
# (manage_master_user_password) and stored in Secrets Manager under the
# persistent CMK. RDS is runtime: platform-down.sh flips deletion_protection
# to false, then destroy takes the final snapshot; platform-up.sh passes the
# latest final snapshot as restore_snapshot_identifier to restore it.

resource "aws_db_subnet_group" "main" {
  name       = "${local.prefix}-pg"
  subnet_ids = aws_subnet.public[*].id

  tags = local.tags
}

resource "aws_db_instance" "main" {
  identifier = "${local.prefix}-pg"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username

  manage_master_user_password   = true
  master_user_secret_kms_key_id = local.persistent.kms_key_arn

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = local.persistent.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false # subnets are public but the instance gets no public address; rds_sg admits only gateway + api
  multi_az               = false # TODO(Phase 2): enable for production HA once traffic justifies the cost.

  # Restore-from-snapshot up-flow: empty string = fresh instance. When
  # restoring, the database name/contents come from the snapshot (db_name is
  # ignored by the restore API — keep it identical anyway).
  snapshot_identifier = var.restore_snapshot_identifier != "" ? var.restore_snapshot_identifier : null

  backup_retention_period = 7

  # true in normal operation; platform-down.sh runs a targeted apply with
  # deletion_protection=false immediately before terraform destroy.
  deletion_protection = var.deletion_protection

  skip_final_snapshot = false
  # platform-down.sh passes a timestamp suffix so repeated down/up cycles
  # never collide on an existing snapshot name.
  final_snapshot_identifier = "${local.prefix}-pg-final-${var.final_snapshot_suffix}"

  auto_minor_version_upgrade = true

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = local.tags
}

# --- Application database credential ----------------------------------------
# Every service connects as pattadar_app with a static password, taking the
# host/port/user/database as plain env and only the password as a secret.
#
# The password lives in the SSM SecureString /<app>/<env>/db-app-password
# (local.ssm_arns), created out of band under the persistent CMK so it never
# transits Terraform state and survives platform-down/up. platform-up.sh
# refuses to continue while it is missing; losing it means a master-user
# ALTER ROLE (reserved).
#
# There used to be a second secret here, pattadar/<env>/db-dsn, composed from
# the RDS-managed MASTER credential and handed to the api as APP_PG_DSN. RDS
# rotates that master password about every seven days, so every new api
# connection failed until an operator re-applied, and composing it wrote the
# master password into state. Neither is deployed any more.

# The old Secrets Manager container for this password left the module with
# the move to SSM. Any state that still holds it forgets it rather than
# deleting it: it is the copy source for the SSM value, and the containers are
# retired in a later, separate change (Reddy, 26/10/2026).
removed {
  from = aws_secretsmanager_secret.db_app_password

  lifecycle {
    destroy = false
  }
}
