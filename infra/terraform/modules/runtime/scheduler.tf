# Daily inactivity-check (family dead-man's-switch escalation engine).
# EventBridge RULE (cron) -> EventBridge API destination -> POST
# ${api_base_url}/cron/inactivity-check with the x-cron-secret header.
# NOTE: EventBridge *Scheduler* does not support API destinations as targets
# (ValidationException: Arn not in correct format — verified empirically);
# scheduled rules do.
#
# The header value is read from the persistent cron-secret secret, so the
# founder must have filled it (`aws secretsmanager put-secret-value`) BEFORE
# the first runtime apply — otherwise this data source fails with
# ResourceNotFoundException on the secret version. See README apply order.

data "aws_secretsmanager_secret_version" "cron_secret" {
  secret_id = local.persistent.secret_arns["cron-secret"]
}

resource "aws_cloudwatch_event_connection" "cron" {
  name               = "${local.prefix}-cron"
  description        = "Carries the x-cron-secret header for /cron/* endpoints"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-cron-secret"
      value = data.aws_secretsmanager_secret_version.cron_secret.secret_string
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "inactivity_check" {
  name                             = "${local.prefix}-inactivity-check"
  description                      = "POST /cron/inactivity-check on the api service (via ALB)"
  invocation_endpoint              = "${var.api_base_url}/cron/inactivity-check"
  http_method                      = "POST"
  invocation_rate_limit_per_second = 1
  connection_arn                   = aws_cloudwatch_event_connection.cron.arn
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    actions   = ["events:InvokeApiDestination"]
    resources = [aws_cloudwatch_event_api_destination.inactivity_check.arn]
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.prefix}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name   = "invoke-api-destination"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

resource "aws_cloudwatch_event_rule" "inactivity_check" {
  name                = "${local.prefix}-inactivity-check"
  description         = "Daily inactivity check at 06:00 UTC (11:30 IST)"
  schedule_expression = "cron(0 6 * * ? *)"
  tags                = local.tags
}

resource "aws_cloudwatch_event_target" "inactivity_check" {
  rule      = aws_cloudwatch_event_rule.inactivity_check.name
  target_id = "api-destination"
  arn       = aws_cloudwatch_event_api_destination.inactivity_check.arn
  role_arn  = aws_iam_role.scheduler.arn

  # NO retries: a re-fired run could double-send the dead-man's-switch
  # escalation notifications to family members. A missed day is recoverable;
  # duplicate "is Sankara ok?" alerts are not.
  retry_policy {
    maximum_retry_attempts       = 0
    maximum_event_age_in_seconds = 60
  }
}
