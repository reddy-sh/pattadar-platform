# Cost guardrails for the whole account: a monthly budget and Cost Anomaly
# Detection, both emailing var.budget_alert_emails. Account singletons, gated
# like guardduty.tf, and off until an address is set (in the git-ignored
# *.auto.tfvars, never here).
# Free (AWS pricing, checked 26/10/2026): budgets without actions and Cost Anomaly Detection.

locals {
  cost_alerts = var.manage_org_security && length(var.budget_alert_emails) > 0
}

resource "aws_budgets_budget" "monthly" {
  count = local.cost_alerts ? 1 : 0

  name         = "${local.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = "50"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Spend is credit-covered, so a budget that nets credits reads ~$0 and
  # never fires; track gross usage instead.
  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 90
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = var.budget_alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "FORECASTED"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = var.budget_alert_emails
  }

  tags = local.tags
}

# AWS allows ONE AWS-services monitor per account and auto-creates it for
# accounts that started Cost Explorer after 27/03/2023. If one exists, the
# create fails: import it first with a root `import` block.
resource "aws_ce_anomaly_monitor" "services" {
  count = local.cost_alerts ? 1 : 0

  name              = "${local.prefix}-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
  tags              = local.tags
}

resource "aws_ce_anomaly_subscription" "daily" {
  count = local.cost_alerts ? 1 : 0

  name             = "${local.prefix}-daily"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services[0].arn]

  dynamic "subscriber" {
    for_each = var.budget_alert_emails
    content {
      type    = "EMAIL"
      address = subscriber.value
    }
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["5"] # USD of total impact
    }
  }

  tags = local.tags
}
