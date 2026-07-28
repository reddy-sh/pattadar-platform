# Application Load Balancer: api.<domain> terminates here (ap-south-1 ACM
# cert), CloudFront also fetches from here (default site behavior in ecs mode
# + /api/*). Listener-rule routing (evaluated by priority, lowest first):
#   priority 10  /cron/inactivity-check -> api      (the ONLY internet-reachable
#                                                     api path; x-user-id
#                                                     invariant, see
#                                                     security_groups.tf)
#   priority 20  /api/*                 -> gateway   (authenticates, sets
#                                                     x-user-id, proxies to api)
#   default      (everything else)      -> web       (Next.js app on :3000)
# The default action moved from gateway to web so a single ALB fronts both the
# site and the API. Gateway now only serves /api/gateway/* + /health (the TG
# health check hits /health on the target directly, bypassing listener rules).
# Bare non-/api paths on api.<domain> now serve the web app — a documented
# semantic change; no current consumer hits bare paths.

# --- Certificate (ap-south-1 — CloudFront's own cert lives in us-east-1) ----

resource "aws_acm_certificate" "api" {
  domain_name       = var.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

# --- Load balancer ----------------------------------------------------------

resource "aws_lb" "main" {
  name               = local.prefix
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # AI extraction requests run up to 180s and are NEVER retried (a retry
  # would double Anthropic spend and can double-import documents). 200 > 180
  # ceiling — do not lower.
  idle_timeout = 200

  drop_invalid_header_fields = true

  # Requires the ELB log-delivery statement on the persistent logs bucket
  # policy (modules/persistent/s3.tf, sid ALBAccessLogsDelivery).
  access_logs {
    bucket  = local.persistent.access_logs_bucket_name
    prefix  = "alb"
    enabled = true
  }

  tags = local.tags
}

# --- Target groups ----------------------------------------------------------

resource "aws_lb_target_group" "gateway" {
  name        = "${local.prefix}-gateway"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  deregistration_delay = 30

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = local.tags
}

resource "aws_lb_target_group" "api" {
  name        = "${local.prefix}-api"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  deregistration_delay = 30

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = local.tags
}

# Web (Next.js) on :3000. Next has no dedicated /health route, so the check
# hits "/" (the landing renders 200); 200-399 tolerates any locale/auth
# redirect the root might issue without flapping the target unhealthy.
resource "aws_lb_target_group" "web" {
  name        = "${local.prefix}-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  deregistration_delay = 30

  health_check {
    path                = "/"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200-399"
  }

  tags = local.tags
}

# --- Listeners --------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn

  # Default -> web (the Next.js site). /api/* and /cron are peeled off by the
  # higher-priority rules below.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  tags = local.tags
}

# The ONLY path the internet may reach on the api service.
resource "aws_lb_listener_rule" "cron_to_api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/cron/inactivity-check"]
    }
  }

  tags = local.tags
}

# API surface -> gateway (authenticates, sets x-user-id, proxies to api).
# CloudFront's /api/* behavior fetches through here; also serves direct
# api.<domain>/api/* callers. Priority 20 keeps it below the cron rule (10)
# and above the default action (web).
resource "aws_lb_listener_rule" "api_to_gateway" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.gateway.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  tags = local.tags
}
