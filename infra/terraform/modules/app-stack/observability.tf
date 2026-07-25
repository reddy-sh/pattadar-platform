# CloudWatch log groups (1-year retention), SNS alarm topic, sample RDS alarm.

resource "aws_cloudwatch_log_group" "service" {
  for_each = local.services

  name              = "/${var.app_name}/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
  tags              = local.tags
}

resource "aws_sns_topic" "alarms" {
  name              = "${local.prefix}-alarms"
  kms_master_key_id = aws_kms_key.main.arn
  tags              = local.tags
}

# TODO(Phase 1): add aws_sns_topic_subscription (email/SMS) once the on-call
# address is decided — email subscriptions require manual confirmation anyway.

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${local.prefix}-rds-cpu-high"
  alarm_description   = "RDS CPU above 80% for 10 minutes"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}
