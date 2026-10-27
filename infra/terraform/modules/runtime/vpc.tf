# 2-AZ public-subnet VPC. Deliberately NO NAT gateways (~$35/mo each saved):
# the one ECS host (ec2.tf) sits in public subnet 0 with a public IPv4 for
# egress only (~$3.6/mo) and a security group whose sole ingress is the
# CloudFront VPC origins. The second subnet exists for the RDS subnet group.
#
# TODO(Phase 2): add private subnets + VPC endpoints (ECR api/dkr, S3, Logs,
# SSM) and move the host private once traffic justifies it.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.tags, { Name = local.prefix })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.tags, { Name = local.prefix })
}

resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.tags, { Name = "${local.prefix}-public-${count.index}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.tags, { Name = "${local.prefix}-public" })
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
