# SPA hosting + edge: private S3 bucket behind CloudFront via OAC, /api/*
# proxied to the ALB (SAME-ORIGIN API — the browser never leaves
# https://pattadar.com, so no CORS anywhere), WAF managed rules at the edge.
#
# Whole file is gated on var.enable_cdn (dev = false: SPA runs locally via
# `bun dev` and talks straight to the dev ALB). WAF additionally gated on
# var.enable_waf. The ACM cert and WAF ACL are us-east-1 (CloudFront-scope
# APIs); everything else stays in ap-south-1.

# --- SPA bucket (runtime-owned: rebuilt from CI on every up, no versioning) --

resource "aws_s3_bucket" "spa" {
  count = var.enable_cdn ? 1 : 0

  bucket = "${local.prefix}-spa-${data.aws_caller_identity.current.account_id}"
  tags   = local.tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  count = var.enable_cdn ? 1 : 0

  bucket = aws_s3_bucket.spa[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # public web assets — SSE-S3 is enough, no CMK round-trips
    }
  }
}

resource "aws_s3_bucket_public_access_block" "spa" {
  count = var.enable_cdn ? 1 : 0

  bucket = aws_s3_bucket.spa[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Only CloudFront (this distribution) may read objects.
data "aws_iam_policy_document" "spa_bucket" {
  count = var.enable_cdn ? 1 : 0

  statement {
    sid       = "CloudFrontOacRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "spa" {
  count = var.enable_cdn ? 1 : 0

  bucket = aws_s3_bucket.spa[0].id
  policy = data.aws_iam_policy_document.spa_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.spa]
}

resource "aws_cloudfront_origin_access_control" "spa" {
  count = var.enable_cdn ? 1 : 0

  name                              = "${local.prefix}-spa"
  description                       = "OAC for the SPA bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- Certificate (us-east-1, CloudFront requirement) ------------------------

resource "aws_acm_certificate" "web" {
  count    = var.enable_cdn ? 1 : 0
  provider = aws.us_east_1

  domain_name               = var.web_domain
  subject_alternative_names = [local.www_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "web_cert_validation" {
  for_each = var.enable_cdn ? {
    for dvo in aws_acm_certificate.web[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  } : {}

  zone_id         = local.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "web" {
  count    = var.enable_cdn ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for r in aws_route53_record.web_cert_validation : r.fqdn]
}

# --- WAF (us-east-1, CLOUDFRONT scope) --------------------------------------

locals {
  waf_managed_rules = [
    { name = "AWSManagedRulesCommonRuleSet", priority = 10 },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 20 },
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 30 },
  ]
}

resource "aws_wafv2_web_acl" "web" {
  count    = var.enable_cdn && var.enable_waf ? 1 : 0
  provider = aws.us_east_1

  name  = "${local.prefix}-web"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.waf_managed_rules

    content {
      name     = rule.value.name
      priority = rule.value.priority

      # waf_block_mode=false = count-only observation mode for initial tuning.
      override_action {
        dynamic "none" {
          for_each = var.waf_block_mode ? [1] : []
          content {}
        }

        dynamic "count" {
          for_each = var.waf_block_mode ? [] : [1]
          content {}
        }
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.value.name
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.prefix}-web"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

# --- Distribution -----------------------------------------------------------

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards ALL viewer headers (incl. Authorization) except Host — required so
# the ALB cert/vhost sees api.<domain>, not pattadar.com.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# Viewer-request function on the DEFAULT behavior only: (a) 301 www -> apex
# (keeps Cognito callbacks single-origin), (b) SPA fallback — extension-less
# URIs rewrite to /index.html BEFORE the origin fetch. Scoped to the default
# behavior, so /api/* status codes and WAF blocks pass through untouched
# (review finding: custom_error_response was distribution-wide and rewrote
# API 403/404s to 200 + index.html).
resource "aws_cloudfront_function" "spa_router" {
  count = var.enable_cdn ? 1 : 0

  name    = "${local.prefix}-spa-router"
  runtime = "cloudfront-js-2.0"
  comment = "www->apex redirect + SPA index.html rewrite"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var host = request.headers.host ? request.headers.host.value : '';
      if (host === 'www.${var.web_domain}') {
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: { location: { value: 'https://${var.web_domain}' + request.uri } }
        };
      }
      if (!request.uri.includes('.')) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "web" {
  count = var.enable_cdn ? 1 : 0

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.prefix} SPA + same-origin /api/*"
  default_root_object = "index.html"
  aliases             = [var.web_domain, local.www_domain]
  price_class         = "PriceClass_200" # includes India
  web_acl_id          = var.enable_waf ? aws_wafv2_web_acl.web[0].arn : null

  origin {
    origin_id                = "spa"
    domain_name              = aws_s3_bucket.spa[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.spa[0].id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # See var.cloudfront_origin_read_timeout: default quota caps this at 60;
      # raise to 180 (extraction ceiling) after the service-quota increase.
      origin_read_timeout      = var.cloudfront_origin_read_timeout
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "spa"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_router[0].arn
    }
  }

  # Same-origin API: browser calls https://pattadar.com/api/* — no CORS.
  # All methods, zero caching, every header forwarded (except Host).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  # Serve /.well-known/* files verbatim from the bucket (e.g.
  # assetlinks.json / apple-app-site-association). The SPA rewrite lives in a
  # viewer-request function on the DEFAULT behavior only, so a missing file
  # here is a genuine 404.
  ordered_cache_behavior {
    path_pattern           = "/.well-known/*"
    target_origin_id       = "spa"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_disabled.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.web[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}
