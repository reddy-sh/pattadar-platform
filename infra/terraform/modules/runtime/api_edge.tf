# api.<domain>: the CloudFront distribution in front of the ECS host (ec2.tf).
# It replaces the ALB listener rules (Reddy, 26/10/2026; Design A):
#   /cron/inactivity-check (exact) -> api_cron VPC origin, host :8081 — the ONLY
#                                     internet path to the api (invariant 1's
#                                     declared exception, guarded by
#                                     CRON_SECRET); POST only, and only
#                                     x-cron-secret + content-type reach it.
#   /api/*                         -> gateway VPC origin, host :8080
#   default (everything else)      -> 404 from a CloudFront Function; it never
#                                     reaches the host.
# scripts/tests/test_edge_routes.py fails CI when any of this drifts.
#
# CloudFront -> VPC origin is HTTP inside AWS (Reddy's recorded exception,
# 26/10/2026); viewer TLS 1.2+ still ends here on a us-east-1 ACM certificate.
#
# Unproven until the dev proof: two VPC origins on one instance ARN, and a
# VPC origin to a public-subnet instance with a public IPv4 (AWS documents
# private subnets). FALLBACKS, not implemented:
#   - two origins on one ARN refused -> one gateway VPC origin plus an
#     exact-path, POST-only gateway passthrough for /cron/inactivity-check that
#     forwards only x-cron-secret plus the api secret. That is a
#     backend-contract change, a test_edge_routes.py update and Reddy's
#     invariant-1 rewording.
#   - a public-subnet instance refused -> a public custom origin restricted to
#     the CloudFront origin-facing prefix list, plus a secret origin header and
#     TLS on the host (or a private subnet plus NAT, about $41/month).

# Recovery keeps the instance id and ARN; only a deliberate replacement changes
# them. Then new origins (named by instance id) are created, both distributions
# repoint, and the old ones go (up to 15 minutes each). replace_triggered_by
# names the id so an in-place instance update does not recreate them.
#
# UpdateVpcOrigin is refused while an origin is in use, so any edit to
# vpc_origin_endpoint_config (port, protocol, TLS list) must be applied with
# -replace on the origin, never as the in-place update the plan shows.
resource "aws_cloudfront_vpc_origin" "gateway" {
  vpc_origin_endpoint_config {
    name                   = "${local.prefix}-gateway-${aws_instance.host.id}"
    arn                    = aws_instance.host.arn
    http_port              = 8080
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [aws_instance.host.id]
  }

  # Deploying (or deleting, with its ENIs) can take 15 minutes or more.
  timeouts {
    create = "30m"
    update = "30m"
    delete = "30m"
  }

  tags = local.tags
}

resource "aws_cloudfront_vpc_origin" "api_cron" {
  vpc_origin_endpoint_config {
    name                   = "${local.prefix}-api-cron-${aws_instance.host.id}"
    arn                    = aws_instance.host.arn
    http_port              = 8081
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [aws_instance.host.id]
  }

  # Deploying (or deleting, with its ENIs) can take 15 minutes or more.
  timeouts {
    create = "30m"
    update = "30m"
    delete = "30m"
  }

  tags = local.tags
}

# AWS creates this service-managed group in the VPC with the first VPC origin.
# The prefix list is deliberately not used: the host has a public IPv4, so it
# would admit any CloudFront customer's distribution.
data "aws_security_group" "cloudfront_vpc_origins" {
  name   = "CloudFront-VPCOrigins-Service-SG"
  vpc_id = aws_vpc.main.id

  depends_on = [aws_cloudfront_vpc_origin.gateway, aws_cloudfront_vpc_origin.api_cron]
}

# The host's only ingress. The assistant's 8082 is never admitted. depends_on
# also orders destroy: this rule goes first, or AWS cannot delete the managed
# group with the last VPC origin and the VPC destroy wedges.
resource "aws_vpc_security_group_ingress_rule" "host_from_cloudfront" {
  security_group_id            = aws_security_group.host.id
  description                  = "Gateway 8080 and api cron 8081 from CloudFront VPC origins only"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8081
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origins.id

  depends_on = [aws_cloudfront_vpc_origin.gateway, aws_cloudfront_vpc_origin.api_cron]
}

# --- Certificate (us-east-1, CloudFront requirement) ------------------------

resource "aws_acm_certificate" "api_edge" {
  provider = aws.us_east_1

  domain_name       = var.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

# ACM issues the same validation CNAME for a domain in every region of an
# account, so the ALB certificate's record carries over instead of being
# deleted and re-created.
moved {
  from = aws_route53_record.api_cert_validation
  to   = aws_route53_record.api_edge_cert_validation
}

resource "aws_route53_record" "api_edge_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api_edge.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api_edge" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.api_edge.arn
  validation_record_fqdns = [for r in aws_route53_record.api_edge_cert_validation : r.fqdn]
}

# --- Functions and policies --------------------------------------------------

resource "aws_cloudfront_function" "api_not_found" {
  name    = "${local.prefix}-api-not-found"
  runtime = "cloudfront-js-2.0"
  comment = "api.<domain> default: 404 at the edge (/graphql, /internal/*, /health never reach the host)"
  publish = true

  code = <<-EOT
    function handler(event) {
      return { statusCode: 404, statusDescription: 'Not Found' };
    }
  EOT
}

resource "aws_cloudfront_function" "cron_post_only" {
  name    = "${local.prefix}-cron-post-only"
  runtime = "cloudfront-js-2.0"
  comment = "/cron/inactivity-check accepts POST only"
  publish = true

  code = <<-EOT
    function handler(event) {
      if (event.request.method !== 'POST') {
        return {
          statusCode: 405,
          statusDescription: 'Method Not Allowed',
          headers: { allow: { value: 'POST' } }
        };
      }
      return event.request;
    }
  EOT
}

# The private_ingress wrapper exempts the cron path from the proxy secret, so
# no viewer x-user-id, x-internal-proxy-secret, cookie or query string may
# reach the api through it.
resource "aws_cloudfront_origin_request_policy" "cron" {
  name    = "${local.prefix}-cron-secret-only"
  comment = "Forward only x-cron-secret and content-type to the api cron origin"

  cookies_config {
    cookie_behavior = "none"
  }

  headers_config {
    header_behavior = "whitelist"

    headers {
      items = ["x-cron-secret", "content-type"]
    }
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

# --- Distribution -----------------------------------------------------------

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.prefix} api (iOS/Expo + cron) -> ECS host"
  aliases         = [var.api_domain]
  price_class     = "PriceClass_200" # includes India
  # The launch WAF needs a first-ranked allow rule for the exact cron path
  # (unsampled) before it is attached here; EventBridge never retries.
  web_acl_id = var.enable_cdn && var.enable_waf ? aws_wafv2_web_acl.web[0].arn : null

  # One attempt: CloudFront must never re-send a request a synchronous paid
  # reading is still working on (invariant 3).
  origin {
    origin_id           = "gateway"
    domain_name         = aws_instance.host.private_dns
    connection_attempts = 1

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.gateway.id
      origin_read_timeout      = var.cloudfront_origin_read_timeout
      origin_keepalive_timeout = 60
    }
  }

  origin {
    origin_id           = "api_cron"
    domain_name         = aws_instance.host.private_dns
    connection_attempts = 1

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.api_cron.id
      origin_read_timeout      = var.cloudfront_origin_read_timeout
      origin_keepalive_timeout = 60
    }
  }

  # All methods so every non-route answers 404, not CloudFront's 403. No origin
  # request policy: even without the function nothing would be forwarded.
  default_cache_behavior {
    target_origin_id       = "gateway"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_disabled.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_not_found.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/cron/inactivity-check"
    target_origin_id         = "api_cron"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.cron.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.cron_post_only.arn
    }
  }

  # Same as the SPA distribution's /api/*: zero caching, every header but Host
  # (Authorization included); the gateway strips client identity headers.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "gateway"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.api_edge.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}

# --- Access logs --------------------------------------------------------------
# The edge is the only per-request record of api and /api/* traffic: behind
# the VPC origin the gateway and api see CloudFront's ENI as the client. Both
# distributions log viewer IP, path, query and status (never cookies or
# Authorization) to the persistent access-logs bucket under
# cloudfront/<distribution>/, as the ALB did under alb/. Standard logging v2
# is configured in us-east-1 and delivers cross-region; delivery to S3 is
# free. The bucket admits it through its CloudFrontAccessLogsDelivery
# statement (modules/persistent/s3.tf).

locals {
  edge_log_sources = merge(
    { api = aws_cloudfront_distribution.api.arn },
    var.enable_cdn ? { web = aws_cloudfront_distribution.web[0].arn } : {},
  )
}

resource "aws_cloudwatch_log_delivery_source" "edge" {
  provider = aws.us_east_1
  for_each = local.edge_log_sources

  name         = "${local.prefix}-${each.key}-edge"
  log_type     = "ACCESS_LOGS"
  resource_arn = each.value
  tags         = local.tags
}

resource "aws_cloudwatch_log_delivery_destination" "edge" {
  provider = aws.us_east_1

  name          = "${local.prefix}-edge-access-logs"
  output_format = "w3c"

  delivery_destination_configuration {
    destination_resource_arn = "arn:aws:s3:::${local.persistent.access_logs_bucket_name}/cloudfront"
  }

  tags = local.tags
}

resource "aws_cloudwatch_log_delivery" "edge" {
  provider = aws.us_east_1
  for_each = local.edge_log_sources

  delivery_source_name     = aws_cloudwatch_log_delivery_source.edge[each.key].name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.edge.arn

  s3_delivery_configuration {
    suffix_path = "${each.key}/{yyyy}/{MM}/{dd}"
  }

  tags = local.tags
}
