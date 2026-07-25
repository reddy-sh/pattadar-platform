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

# --- Composed connection-string secret (APP_PG_DSN) -------------------------
# The services consume a single DSN. Terraform composes it from the RDS
# endpoint plus the RDS-managed master secret and stores it as a runtime
# secret pattadar/<env>/db-dsn (destroyed with the runtime layer; the managed
# master secret itself lives with the instance/snapshot).
#
# NOTE / caveat: RDS rotates the managed master password automatically
# (~every 7 days), which goes stale in this composed DSN AND in already
# running tasks (ECS injects secrets only at task start). After a rotation:
# `terraform apply` here + force-new-deployment of both services.
# TODO(Phase 2): dedicated app DB user with a Terraform-independent rotation
# story, or IAM database auth. Also note the DSN transits Terraform state —
# acceptable because state lives in the encrypted, locked state bucket.

data "aws_secretsmanager_secret_version" "db_master" {
  secret_id = aws_db_instance.main.master_user_secret[0].secret_arn
}

resource "aws_secretsmanager_secret" "db_dsn" {
  name       = "${var.app_name}/${var.environment}/db-dsn"
  kms_key_id = local.persistent.kms_key_arn

  # Runtime layer is destroy/recreate by design; don't hold the name hostage
  # for the default 30-day recovery window.
  recovery_window_in_days = 0

  tags = local.tags
}

resource "aws_secretsmanager_secret_version" "db_dsn" {
  secret_id = aws_secretsmanager_secret.db_dsn.id
  secret_string = format(
    "postgresql://%s:%s@%s/%s",
    jsondecode(data.aws_secretsmanager_secret_version.db_master.secret_string)["username"],
    urlencode(jsondecode(data.aws_secretsmanager_secret_version.db_master.secret_string)["password"]),
    aws_db_instance.main.endpoint, # host:5432
    var.db_name,
  )
}
