# Placeholder secrets — Terraform creates the containers only; the founder
# fills the values out-of-band (console or `aws secretsmanager put-secret-value`)
# so no secret material ever touches state or VCS.
#
#   anthropic-api-key — direct Anthropic API key for document extraction
#   cron-secret       — shared secret validating /cron/* callers (x-cron-secret)
#   cognito-config    — JSON: extra Cognito wiring the services need beyond the
#                       Terraform outputs (e.g. server-side client settings)
#   notify-providers  — JSON: email/WhatsApp/SMS provider credentials (env-gated stubs until live)

locals {
  secret_names = toset([
    "anthropic-api-key",
    "cron-secret",
    "cognito-config",
    "notify-providers",
  ])
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.secret_names

  name       = "${var.app_name}/${var.environment}/${each.key}"
  kms_key_id = aws_kms_key.main.arn
  tags       = local.tags
}
