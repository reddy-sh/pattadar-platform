# DNS records into the PERSISTENT hosted zone (the zone itself survives
# platform-down; these records are destroyed/recreated with the runtime
# layer). Nothing resolves publicly until the registrar NS switch (Track B) —
# the existing Azure-DNS site stays up until then.

# apex + www -> CloudFront (only when the CDN exists).

resource "aws_route53_record" "apex_a" {
  count = var.enable_cdn ? 1 : 0

  zone_id = local.zone_id
  name    = var.web_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count = var.enable_cdn ? 1 : 0

  zone_id = local.zone_id
  name    = var.web_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_a" {
  count = var.enable_cdn ? 1 : 0

  zone_id = local.zone_id
  name    = local.www_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_aaaa" {
  count = var.enable_cdn ? 1 : 0

  zone_id = local.zone_id
  name    = local.www_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web[0].domain_name
    zone_id                = aws_cloudfront_distribution.web[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# api -> ALB (direct API + EventBridge cron target + CloudFront /api/* origin).

resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
