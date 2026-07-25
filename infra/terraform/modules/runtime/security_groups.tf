# Traffic tiering: internet -> alb -> gateway -> api -> rds.
#
# INVARIANT: the api service trusts the x-user-id header and must NEVER be
# internet-reachable — except its /cron/inactivity-check path. That is why the
# ALB may reach api (it forwards ONLY /cron/inactivity-check there, see the
# listener rules in alb.tf; everything else goes to gateway, which
# authenticates the caller before setting x-user-id).

resource "aws_security_group" "alb" {
  name        = "${local.prefix}-alb"
  description = "ALB - public HTTPS entry point"
  vpc_id      = aws_vpc.main.id

  # 443 open to the world: both CloudFront (whose egress IPs are not fixed)
  # and the EventBridge cron API destination must reach the ALB directly.
  ingress {
    description = "HTTPS from anywhere (CloudFront origin fetches + cron API destination + direct API)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 80 exists only to issue the HTTP->HTTPS redirect.
  ingress {
    description = "HTTP, redirect-only"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All egress (to target groups)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.prefix}-alb" })
}

resource "aws_security_group" "gateway" {
  name        = "${local.prefix}-gateway"
  description = "Gateway service - only the ALB may connect"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App traffic from the ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All egress (ECR pulls, Secrets Manager, api, RDS - public subnets, no NAT)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.prefix}-gateway" })
}

resource "aws_security_group" "api" {
  name        = "${local.prefix}-api"
  description = "API service - gateway plus ALB (cron path only)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Proxied app traffic from gateway (gateway sets x-user-id after auth)"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  ingress {
    description     = "From ALB - listener rules forward ONLY /cron/inactivity-check here"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All egress (ECR pulls, Secrets Manager, Anthropic API, RDS)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${local.prefix}-api" })
}

resource "aws_security_group" "rds" {
  name        = "${local.prefix}-rds"
  description = "PostgreSQL - only gateway and api services"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from gateway"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  ingress {
    description     = "PostgreSQL from api"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  # No egress needed - RDS never initiates connections.

  tags = merge(local.tags, { Name = "${local.prefix}-rds" })
}

# assistant: reachable ONLY from the gateway (SSE proxy path).
resource "aws_security_group" "assistant" {
  name_prefix = "${local.prefix}-assistant-"
  description = "assistant tasks - ingress from gateway only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "gateway to assistant"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags

  lifecycle {
    create_before_destroy = true
  }
}
