# DNS records into the PERSISTENT hosted zone (the zone itself survives
# platform-down; these records are destroyed/recreated with the runtime
# layer). Nothing resolves publicly until the registrar NS switch (Track B) —
# the existing Azure-DNS site stays up until then.

# apex + www -> CloudFront (only when the CDN exists).

resource "aws_route53_record" "apex_a" {
  count = var.enable_cdn ? 1 : 0

  # Overwrite the out-of-band records that kept the Azure site live pre-cutover.
  allow_overwrite = true
  zone_id         = local.zone_id
  name            = var.web_domain
  type            = "A"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count = var.enable_cdn ? 1 : 0

  # Overwrite the out-of-band records that kept the Azure site live pre-cutover.
  allow_overwrite = true
  zone_id         = local.zone_id
  name            = var.web_domain
  type            = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_a" {
  count = var.enable_cdn ? 1 : 0

  allow_overwrite = true
  zone_id         = local.zone_id
  name            = local.www_domain
  type            = "A"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count = var.enable_cdn ? 1 : 0

  allow_overwrite = true
  zone_id         = local.zone_id
  name            = local.www_domain
  type            = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# api -> the api CloudFront distribution (api_edge.tf: iOS/Expo API and the
# EventBridge cron target).

resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = local.zone_id
  name    = var.api_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = false
  }
}
