# Traffic tiering: CloudFront VPC origins -> the ECS host SG (ec2.tf, ingress
# rule in api_edge.tf) -> gateway/api containers; rds admits the host only.
#
# INVARIANT: the api trusts the x-user-id header and must NEVER be
# internet-reachable — except its /cron/inactivity-check path, which only the
# api distribution's exact-path behaviour targets. All three services share
# the host, so security groups cannot separate them: isolation between
# containers is the api-wide internal proxy secret (private_ingress), not SGs.

resource "aws_security_group" "rds" {
  name = "${local.prefix}-rds"
  # Stale label kept on purpose: description is ForceNew, and replacing the SG
  # under a live RDS ENI fails with DependencyViolation. Only the ECS host is
  # admitted (below).
  description = "PostgreSQL - only gateway and api services"
  vpc_id      = aws_vpc.main.id

  # Bridge-mode containers are NATed to the host ENI, so the host SG is the
  # only source.
  ingress {
    description     = "PostgreSQL from the ECS host (gateway, api, assistant)"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.host.id]
  }

  # No egress needed - RDS never initiates connections.

  tags = merge(local.tags, { Name = "${local.prefix}-rds" })
}
