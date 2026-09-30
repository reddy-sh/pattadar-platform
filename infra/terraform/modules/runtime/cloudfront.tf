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

# --- Village maps (/vm/*) ----------------------------------------------------
# The bucket is persistent-owned (modules/persistent/village_maps.tf) so the
# published maps survive platform-down; its policy is owned HERE because it
# names this distribution. try(): a persistent state from before the bucket
# existed simply has no /vm/* origin, and /vm/* falls through to the SPA
# bucket's bundled fixture as it did before.

locals {
  vm_bucket_name   = try(local.persistent.village_maps_bucket_name, null)
  vm_bucket_arn    = try(local.persistent.village_maps_bucket_arn, null)
  vm_bucket_domain = try(local.persistent.village_maps_bucket_regional_domain_name, null)
  vm_enabled       = var.enable_cdn && local.vm_bucket_name != null
}

data "aws_iam_policy_document" "vm_bucket" {
  count = local.vm_enabled ? 1 : 0

  statement {
    sid       = "CloudFrontOacRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.vm_bucket_arn}/*"]

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

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      local.vm_bucket_arn,
      "${local.vm_bucket_arn}/*",
    ]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "vm" {
  count = local.vm_enabled ? 1 : 0

  bucket = local.vm_bucket_name
  policy = data.aws_iam_policy_document.vm_bucket[0].json
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
    # SizeRestrictions_BODY blocks request bodies over the ~8KB inspection
    # limit — fatal for a document-upload app (the gateway enforces its own
    # 100MB cap). Count-only for that single rule; everything else blocks.
    { name = "AWSManagedRulesCommonRuleSet", priority = 10, count_rules = ["SizeRestrictions_BODY"] },
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

          dynamic "rule_action_override" {
            for_each = try(rule.value.count_rules, [])

            content {
              name = rule_action_override.value

              action_to_use {
                count {}
              }
            }
          }
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

# The DEFAULT behavior's viewer-request function does TWO jobs, and which
# variant is associated depends on var.web_origin (see the default behavior
# below). BOTH functions are always created (cheap, and flipping the switch
# then never creates/destroys a function) but only one is wired in at a time.
#
# spa mode — spa_router: (a) 301 www -> apex (keeps Cognito callbacks
# single-origin), (b) SPA fallback — extension-less URIs rewrite to
# /index.html BEFORE the S3 origin fetch. Scoped to the default behavior, so
# /api/* status codes and WAF blocks pass through untouched (review finding:
# custom_error_response was distribution-wide and rewrote API 403/404s to
# 200 + index.html).
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

# ecs mode — www_redirect: the SAME www -> apex 301 (Next handles its own
# routing, so NO index.html rewrite). The function MUST stay associated in
# ecs mode: dropping it would let www.<domain> resolve as a second origin and
# break the single-origin Cognito-callback rule.
resource "aws_cloudfront_function" "www_redirect" {
  count = var.enable_cdn ? 1 : 0

  name    = "${local.prefix}-www-redirect"
  runtime = "cloudfront-js-2.0"
  comment = "www->apex redirect only (ecs mode; Next owns path routing)"
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
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "web" {
  count = var.enable_cdn ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.prefix} ${var.web_origin == "ecs" ? "Next.js (ECS)" : "SPA"} + same-origin /api/*"

  # spa mode roots to /index.html (the SPA shell). In ecs mode it MUST be null:
  # Next serves the apex itself, and a forced /index.html fetch 404s.
  default_root_object = var.web_origin == "ecs" ? null : "index.html"

  aliases     = [var.web_domain, local.www_domain]
  price_class = "PriceClass_200" # includes India
  web_acl_id  = var.enable_waf ? aws_wafv2_web_acl.web[0].arn : null

  origin {
    origin_id                = "spa"
    domain_name              = aws_s3_bucket.spa[0].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.spa[0].id
  }

  # Village maps, read through the same S3 OAC (it signs for any S3 origin; the
  # bucket policy above is what scopes the read to this distribution).
  dynamic "origin" {
    for_each = local.vm_enabled ? [1] : []

    content {
      origin_id                = "vm"
      domain_name              = local.vm_bucket_domain
      origin_access_control_id = aws_cloudfront_origin_access_control.spa[0].id
    }
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # See var.cloudfront_origin_read_timeout: default quota caps this at 60.
      # It bounds large uploads, not extraction — extraction is a durable job
      # with short polls. Raise to 180 after the service-quota increase.
      origin_read_timeout      = var.cloudfront_origin_read_timeout
      origin_keepalive_timeout = 60
    }
  }

  # Default behavior serves the SITE.
  #   spa mode -> S3 bucket, CachingOptimized, GET/HEAD, spa_router (rewrite).
  #   ecs mode -> ALB origin ("api"), CachingDisabled + AllViewerExceptHostHeader
  #     (mirrors /api/* so authenticated HTML is never edge-cached and every
  #     header except Host reaches Next), all methods (App Router server
  #     actions POST to page routes), and the redirect-only www function.
  default_cache_behavior {
    target_origin_id       = var.web_origin == "ecs" ? "api" : "spa"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = var.web_origin == "ecs" ? ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"] : ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = var.web_origin == "ecs" ? data.aws_cloudfront_cache_policy.caching_disabled.id : data.aws_cloudfront_cache_policy.caching_optimized.id

    origin_request_policy_id = var.web_origin == "ecs" ? data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id : null

    function_association {
      event_type   = "viewer-request"
      function_arn = var.web_origin == "ecs" ? aws_cloudfront_function.www_redirect[0].arn : aws_cloudfront_function.spa_router[0].arn
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

  # /vm/* — shipped village maps from the persistent village-maps bucket.
  # GET/HEAD only, CachingOptimized (the objects carry their own
  # Cache-Control, set by scripts/vm-publish.py, which also invalidates /vm/*
  # after a publish). The SPA rewrite is on the default behavior only, so a
  # missing map is a genuine 403/404, never index.html parsed as JSON.
  dynamic "ordered_cache_behavior" {
    for_each = local.vm_enabled ? [1] : []

    content {
      path_pattern           = "/vm/*"
      target_origin_id       = "vm"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    }
  }

  # ecs mode only: Next's immutable, content-hashed build assets. Long-cache
  # them at the edge (CachingOptimized) straight from the ALB origin. The SPA
  # (Vite) never emits /_next/static, so this behavior is inert in spa mode
  # and is therefore not created there.
  dynamic "ordered_cache_behavior" {
    for_each = var.web_origin == "ecs" ? [1] : []

    content {
      path_pattern           = "/_next/static/*"
      target_origin_id       = "api"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    }
  }

  # /.well-known/* — mobile app-link files (assetlinks.json /
  # apple-app-site-association). Origin follows the switch:
  #   spa mode -> S3 bucket (files uploaded there out-of-band).
  #   ecs mode -> ALB origin, so Next serves them from
  #     the web container's public/.well-known/ (decision D9, now moot:
  #     that client was removed and the SPA bucket serves these files).
  # CachingDisabled either way (app-link files must update promptly). The SPA
  # rewrite lives on the DEFAULT behavior only, so a missing file is a genuine
  # 404 here, not an index.html.
  ordered_cache_behavior {
    path_pattern           = "/.well-known/*"
    target_origin_id       = var.web_origin == "ecs" ? "api" : "spa"
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
