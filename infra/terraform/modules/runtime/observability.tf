# Per-service log groups, CMK-encrypted SNS alarms topic + email subscription,
# and eleven CloudWatch alarms: RDS x2, cron x2, no-running-task x3, host
# instance/system status, CPU surplus charged, host unhealthy. The free tier
# covers ten, so the eleventh (the security review's host probe) costs about
# $0.10/month: Reddy has not yet accepted that, nor folded one away.
# ECS task crashes reach the same topic through a free EventBridge rule; it
# delivers only once the persistent CMK policy's EventsUse statement
# (modules/persistent/kms.tf) is applied.
#
# Expected noise: the Sunday 21:30 UTC patch reboot can stop tasks
# (EssentialContainerExited) and leave the host probe with no task to probe,
# and host-unhealthy breaches at every platform-up until the first probe runs.

resource "aws_cloudwatch_log_group" "service" {
  for_each = local.services

  name              = "/${var.app_name}/${var.environment}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = local.persistent.kms_key_arn
  tags              = local.tags
}

# --- Alarm delivery ---------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  name              = "${local.prefix}-alarms"
  kms_master_key_id = local.persistent.kms_key_arn
  tags              = local.tags
}

# NOTE: email subscriptions require clicking the confirmation link AWS sends
# after apply — until confirmed, alarms fire into the void. Terraform cannot
# confirm it for you.
resource "aws_sns_topic_subscription" "alarms_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Replaces the default topic policy: alarms and the task-stopped rule publish;
# same-account IAM principals keep their access through IAM.
data "aws_iam_policy_document" "alarms_topic" {
  statement {
    sid       = "CloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alarms.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid       = "EcsTaskStoppedRule"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alarms.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ecs_task_stopped.arn]
    }
  }
}

resource "aws_sns_topic_policy" "alarms" {
  arn    = aws_sns_topic.alarms.arn
  policy = data.aws_iam_policy_document.alarms_topic.json
}

# --- RDS --------------------------------------------------------------------

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

resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  alarm_name          = "${local.prefix}-rds-free-storage-low"
  alarm_description   = "RDS free storage below 2 GiB (of 20 GiB gp3) — grow allocated_storage"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 2147483648 # 2 GiB in bytes
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

# --- Cron -------------------------------------------------------------------

# The daily inactivity check is the family safeguard: reminders on days 181,
# 187 and 195 of an idle account. It runs with no retries (a re-fired run could
# double-send "is Sankara ok?" to relatives), so a failure is a silently
# skipped day — and a rotated connection secret makes EVERY day fail with a
# 403 until someone re-applies. Both need to page.
resource "aws_cloudwatch_metric_alarm" "cron_failed_invocations" {
  alarm_name          = "${local.prefix}-cron-failed-invocations"
  alarm_description   = "Inactivity-check schedule failed to invoke its API destination — the dead-man's-switch escalation did not run"
  namespace           = "AWS/Events"
  metric_name         = "FailedInvocations"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    RuleName = aws_cloudwatch_event_rule.inactivity_check.name
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "cron_did_not_run" {
  alarm_name          = "${local.prefix}-cron-did-not-run"
  alarm_description   = "Inactivity-check schedule produced no invocation in 24h — the rule is disabled, deleted, or its target is gone"
  namespace           = "AWS/Events"
  metric_name         = "Invocations"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    RuleName = aws_cloudwatch_event_rule.inactivity_check.name
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

# --- ECS host and services --------------------------------------------------

# Whole-service-down: the service CPU metric stops arriving when a service has
# no running task. SampleCount rather than RunningTaskCount on purpose — the
# latter is a Container Insights metric, and Insights is disabled for cost.
resource "aws_cloudwatch_metric_alarm" "ecs_no_running_task" {
  for_each = local.services

  alarm_name          = "${local.prefix}-${each.key}-no-running-task"
  alarm_description   = "${each.key} has no running task — the service is down, crash-looping or the host is gone"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "SampleCount"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

# Simplified auto-recovery covers system (hardware) failures but not an OS
# hang, so the instance check reboots the host.
resource "aws_cloudwatch_metric_alarm" "host_instance_status" {
  alarm_name          = "${local.prefix}-host-instance-status"
  alarm_description   = "ECS host failed its instance status check (OS hang, memory exhaustion, filesystem) — rebooting it"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    InstanceId = aws_instance.host.id
  }

  alarm_actions = ["arn:aws:automate:${data.aws_region.current.region}:ec2:reboot", aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "host_system_status" {
  alarm_name          = "${local.prefix}-host-system-status"
  alarm_description   = "ECS host failed its system status check — AWS auto-recovery is moving it; expect 5-10 minutes of full outage"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"

  dimensions = {
    InstanceId = aws_instance.host.id
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

resource "aws_cloudwatch_metric_alarm" "host_cpu_surplus_charged" {
  alarm_name          = "${local.prefix}-host-cpu-surplus-charged"
  alarm_description   = "Unlimited-mode CPU credits were charged today — sustained load; consider Standard credit mode (hard cap) or a bigger host"
  namespace           = "AWS/EC2"
  metric_name         = "CPUSurplusCreditsCharged"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = aws_instance.host.id
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

# Published by the host_probe association (ec2.tf) every 30 minutes; missing
# data breaches so a dead probe is not mistaken for a healthy host.
resource "aws_cloudwatch_metric_alarm" "host_unhealthy" {
  alarm_name          = "${local.prefix}-host-unhealthy"
  alarm_description   = "Host probe failed (its Run Command output says which): a task reached 169.254.169.254 (instance role exposed - treat as a credential exposure), a probe could not run, no task was running, or the root volume is over 85%; or the probe stopped reporting"
  namespace           = local.host_metric_namespace
  metric_name         = "HostUnhealthy"
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]
  tags          = local.tags
}

# Crash, OOM, failed start or failed health check — not the routine stop of
# every deploy (ServiceSchedulerInitiated with a deployment reason).
resource "aws_cloudwatch_event_rule" "ecs_task_stopped" {
  name        = "${local.prefix}-ecs-task-stopped"
  description = "An ECS task on the host crashed, failed to start or failed its health check"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.main.arn]
      lastStatus = ["STOPPED"]
      "$or" = [
        { stopCode = ["EssentialContainerExited", "TaskFailedToStart"] },
        { stoppedReason = [{ prefix = "Task failed" }] },
      ]
    }
  })

  tags = local.tags
}

resource "aws_cloudwatch_event_target" "ecs_task_stopped" {
  rule      = aws_cloudwatch_event_rule.ecs_task_stopped.name
  target_id = "alarms-topic"
  arn       = aws_sns_topic.alarms.arn
}
