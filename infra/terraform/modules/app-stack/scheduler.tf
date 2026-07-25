# Daily inactivity-check (family dead-man's-switch escalation engine).
# EventBridge Scheduler -> EventBridge API destination -> POST
# ${api_base_url}/cron/inactivity-check with the x-cron-secret header.
#
# The header value comes from var.cron_secret_header_value (sensitive) — supply
# it at apply time from the cron-secret Secrets Manager secret; the api service
# validates the same value.

resource "aws_cloudwatch_event_connection" "cron" {
  name               = "${local.prefix}-cron"
  description        = "Carries the x-cron-secret header for /cron/* endpoints"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-cron-secret"
      value = var.cron_secret_header_value
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "inactivity_check" {
  name                             = "${local.prefix}-inactivity-check"
  description                      = "POST /cron/inactivity-check on the api service"
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
      identifiers = ["scheduler.amazonaws.com"]
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

resource "aws_scheduler_schedule" "inactivity_check" {
  name        = "${local.prefix}-inactivity-check"
  description = "Daily inactivity check at 06:00 UTC (11:30 IST)"

  schedule_expression          = "cron(0 6 * * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_cloudwatch_event_api_destination.inactivity_check.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}
