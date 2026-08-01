# Cognito user pool — the platform identity store (replaces Auth0).
# Persistent by definition: user accounts must survive platform-down.
#
# ESSENTIALS tier is required for V2_0 pre-token-generation (access-token
# claim customization). Hosted UI runs on the prefix domain
# pattadar-auth-<env>; TODO(Track B): custom domain auth.pattadar.com after
# the NS cutover + ACM cert.

# --- Pre-token-generation Lambda -------------------------------------------
# Mirrors the email claim (lowercased) into both tokens; see lambda/pre_token_gen.py.

data "archive_file" "pre_token_gen" {
  type        = "zip"
  source_file = "${path.module}/lambda/pre_token_gen.py"
  output_path = "${path.module}/lambda/pre_token_gen.zip"
}

data "aws_iam_policy_document" "pre_token_gen_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pre_token_gen" {
  name               = "${local.prefix}-pre-token-gen"
  assume_role_policy = data.aws_iam_policy_document.pre_token_gen_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "pre_token_gen_logs" {
  role       = aws_iam_role.pre_token_gen.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "pre_token_gen" {
  function_name    = "${local.prefix}-pre-token-gen"
  description      = "Cognito pre-token-generation V2: mirror lowercased email into access + id tokens"
  role             = aws_iam_role.pre_token_gen.arn
  runtime          = "python3.12"
  handler          = "pre_token_gen.handler"
  filename         = data.archive_file.pre_token_gen.output_path
  source_code_hash = data.archive_file.pre_token_gen.output_base64sha256
  timeout          = 5
  memory_size      = 128
  tags             = local.tags
}

resource "aws_lambda_permission" "cognito_invoke" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_token_gen.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.pattadar.arn
}

# --- User pool --------------------------------------------------------------

resource "aws_cognito_user_pool" "pattadar" {
  name = local.prefix

  user_pool_tier      = "ESSENTIALS"
  deletion_protection = "ACTIVE"

  # Sign in with email, case-insensitive.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Pilot: open self-signup.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 2048
    }
  }

  # Changing the email requires re-verifying it before it takes effect.
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
    # TODO(Track B): flip to SES once the pattadar.com identity is verified
    # (post NS cutover) and the account is out of the SES sandbox:
    #   email_sending_account = "DEVELOPER"
    #   source_arn            = aws_ses_domain_identity.main[0].arn
    #   from_email_address    = "Pattadar <no-reply@pattadar.com>"
  }

  lambda_config {
    pre_token_generation_config {
      lambda_arn     = aws_lambda_function.pre_token_gen.arn
      lambda_version = "V2_0"
    }
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

# --- SPA app client (public, code flow, no secret) --------------------------

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${local.prefix}-spa"
  user_pool_id = aws_cognito_user_pool.pattadar.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = var.spa_callback_urls
  logout_urls   = var.spa_logout_urls

  # IdPs must exist before the client can list them.
  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.facebook,
    aws_cognito_identity_provider.apple,
  ]

  # Native in-app login pages use SRP against the Cognito API — no hosted UI.
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  supported_identity_providers = concat(
    ["COGNITO"],
    var.enable_google_idp ? ["Google"] : [],
    var.enable_facebook_idp ? ["Facebook"] : [],
    var.enable_apple_idp ? ["SignInWithApple"] : [],
  )

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}

# --- Native app client (iOS; public, code + PKCE, custom-scheme callback) ----
#
# Prod already has this client — it was made in the console during the iOS
# spike and has been drift ever since. This resource codifies it; adopt the
# live one rather than creating a twin:
#
#   cd envs/prod/persistent
#   terraform import 'module.persistent.aws_cognito_user_pool_client.mobile' \
#     ap-south-1_XfgAF21Z3/44gv48ihjlgub7h0lnvjbdmj89
#
# Dev has no mobile client yet; the next dev apply creates one.

resource "aws_cognito_user_pool_client" "mobile" {
  name         = "${local.prefix}-mobile"
  user_pool_id = aws_cognito_user_pool.pattadar.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  # ASWebAuthenticationSession custom scheme, registered in the app's
  # Info.plist. Not https on purpose: the callback never leaves the device.
  callback_urls = ["pattadar://auth"]
  logout_urls   = ["pattadar://signout"]

  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.facebook,
    aws_cognito_identity_provider.apple,
  ]

  # Hosted UI does the authenticating; the client itself only ever redeems
  # refresh tokens.
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  supported_identity_providers = concat(
    ["COGNITO"],
    var.enable_google_idp ? ["Google"] : [],
  )

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}

# --- Hosted UI domain -------------------------------------------------------

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "pattadar-auth-${var.environment}"
  user_pool_id = aws_cognito_user_pool.pattadar.id

  # v2 = the modern Managed Login pages (branded), not the classic gray form.
  managed_login_version = 2
}

# Default modern styling; customize colors/logo later in the branding editor.
resource "aws_cognito_managed_login_branding" "spa" {
  user_pool_id = aws_cognito_user_pool.pattadar.id
  client_id    = aws_cognito_user_pool_client.spa.id

  use_cognito_provided_values = true
}

# --- Social identity providers (each gated on its enable flag + creds in the
# idp-social secret). Hosted UI shows the buttons automatically once enabled.
# Account-linking caveat: a federated login with the same email creates a
# SEPARATE Cognito user (different sub) — our app id derives from the email
# claim, so data scope converges, but the pre-pilot pre-signup guard MUST
# also reject federated identities whose email is unverified.

data "aws_secretsmanager_secret_version" "idp_social" {
  count     = (var.enable_google_idp || var.enable_facebook_idp || var.enable_apple_idp) ? 1 : 0
  secret_id = aws_secretsmanager_secret.app["idp-social"].id
}

locals {
  idp_social = length(data.aws_secretsmanager_secret_version.idp_social) > 0 ? jsondecode(data.aws_secretsmanager_secret_version.idp_social[0].secret_string) : {}
}

resource "aws_cognito_identity_provider" "google" {
  count = var.enable_google_idp ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.pattadar.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = local.idp_social.google.client_id
    client_secret    = local.idp_social.google.client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    name           = "name"
    username       = "sub"
  }
}

resource "aws_cognito_identity_provider" "facebook" {
  count = var.enable_facebook_idp ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.pattadar.id
  provider_name = "Facebook"
  provider_type = "Facebook"

  provider_details = {
    client_id        = local.idp_social.facebook.app_id
    client_secret    = local.idp_social.facebook.app_secret
    authorize_scopes = "public_profile,email"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "id"
  }
}

resource "aws_cognito_identity_provider" "apple" {
  count = var.enable_apple_idp ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.pattadar.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    client_id        = local.idp_social.apple.services_id
    team_id          = local.idp_social.apple.team_id
    key_id           = local.idp_social.apple.key_id
    private_key      = local.idp_social.apple.private_key
    authorize_scopes = "email name"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
  }
}


# --- Custom auth domain (auth.<domain>) — social-login redirects stay on the
# founder's domain; amazoncognito.com never reaches a customer's browser.
# Precondition (verified live): the parent apex already resolves via an A
# record (CloudFront), which Cognito requires before accepting the domain.

locals {
  custom_auth_enabled = var.custom_auth_domain != "" && var.manage_dns
}

resource "aws_acm_certificate" "auth" {
  count    = local.custom_auth_enabled ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.custom_auth_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "auth_cert_validation" {
  for_each = local.custom_auth_enabled ? {
    for dvo in aws_acm_certificate.auth[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  allow_overwrite = true
  zone_id         = aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 300
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "auth" {
  count    = local.custom_auth_enabled ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.auth[0].arn
  validation_record_fqdns = [for r in aws_route53_record.auth_cert_validation : r.fqdn]
}

resource "aws_cognito_user_pool_domain" "custom" {
  count = local.custom_auth_enabled ? 1 : 0

  domain          = var.custom_auth_domain
  user_pool_id    = aws_cognito_user_pool.pattadar.id
  certificate_arn = aws_acm_certificate_validation.auth[0].certificate_arn

  managed_login_version = 2
}

resource "aws_route53_record" "auth_alias" {
  for_each = local.custom_auth_enabled ? toset(["A", "AAAA"]) : toset([])

  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.custom_auth_domain
  type    = each.value

  alias {
    name                   = aws_cognito_user_pool_domain.custom[0].cloudfront_distribution
    zone_id                = aws_cognito_user_pool_domain.custom[0].cloudfront_distribution_zone_id
    evaluate_target_health = false
  }
}
