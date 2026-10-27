# The one ECS host: gateway, api and assistant run as bridge-mode tasks on a
# single ECS-optimized AL2023 arm64 instance (Reddy, 26/10/2026; Design A).
#
# Shared kernel, accepted for PRE-LAUNCH only: before any real Aadhaar data
# reaches this host Reddy signs off pattadar-security-review, and the launch
# trigger is GuardDuty Runtime Monitoring for EC2 or the revert to Fargate.
#
# Standalone instance, not an ASG: simplified auto-recovery keeps the instance
# id, ARN and private DNS, so the CloudFront VPC origins stay valid. No key
# pair and no SSH: access is SSM Session Manager only. Ingress comes only from
# the CloudFront VPC origins security group (api_edge.tf); the public IPv4 is
# for egress (no NAT).
#
# The VPC origins are create_before_destroy, and Terraform forces that on
# everything they depend on: this instance, its role, profile and SG, the
# cluster, subnet and VPC. Fixed names would collide on a replacement, so the
# SG and profile take a name_prefix.

data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

data "aws_iam_policy_document" "host_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "host" {
  name               = "${local.prefix}-ecs-instance"
  assume_role_policy = data.aws_iam_policy_document.host_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "host_managed" {
  for_each = toset([
    "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  ])

  role       = aws_iam_role.host.name
  policy_arn = each.value
}

# The host probe below publishes its result; nothing else.
data "aws_iam_policy_document" "host_probe" {
  statement {
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [local.host_metric_namespace]
    }
  }
}

resource "aws_iam_role_policy" "host_probe" {
  name   = "host-probe-metric"
  role   = aws_iam_role.host.id
  policy = data.aws_iam_policy_document.host_probe.json
}

resource "aws_iam_instance_profile" "host" {
  name_prefix = "${local.prefix}-ecs-instance-"
  role        = aws_iam_role.host.name
  tags        = local.tags
}

# Egress only. The single ingress rule (CloudFront VPC origins -> 8080-8081)
# lives in api_edge.tf; there is never cidr, prefix-list or port 22 ingress.
resource "aws_security_group" "host" {
  name_prefix = "${local.prefix}-host-"
  description = "ECS host - ingress only from CloudFront VPC origins"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.tags, { Name = "${local.prefix}-host" })
}

resource "aws_vpc_security_group_egress_rule" "host_all" {
  security_group_id = aws_security_group.host.id
  description       = "All egress (ECR, SSM, Logs, RDS, providers - public subnet, no NAT)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_instance" "host" {
  ami                         = data.aws_ssm_parameter.ecs_ami.insecure_value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.host.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.host.name

  # Containers must never reach the instance role: IMDSv2 with hop limit 1
  # (a bridge container is one hop too far for the token) plus the
  # DOCKER-USER drop, re-applied on every Docker start.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  # Uploads spool deed and Aadhaar bytes into container writable layers here.
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    kms_key_id            = local.persistent.kms_key_arn
    delete_on_termination = true
  }

  # Unlimited so HEIC/PDF work during a paid reading is never throttled; the
  # CPUSurplusCreditsCharged alarm reports any charge (Standard is the cap).
  credit_specification {
    cpu_credits = "unlimited"
  }

  maintenance_options {
    auto_recovery = "default"
  }

  # ECS places a task that sets dockerSecurityOptions (no-new-privileges,
  # ecs.tf) only on an agent registered SELinux- or AppArmor-capable. AL2023
  # runs SELinux permissive and no label: option is used, so the flag only
  # registers the capability.
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail

    cat > /etc/ecs/ecs.config <<'CFG'
    ECS_CLUSTER=${aws_ecs_cluster.main.name}
    ECS_ENABLE_TASK_IAM_ROLE=true
    ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=false
    ECS_DISABLE_PRIVILEGED=true
    ECS_SELINUX_CAPABLE=true
    ECS_RESERVED_MEMORY=256
    ECS_IMAGE_PULL_BEHAVIOR=prefer-cached
    ECS_ENABLE_AWSLOGS_EXECUTIONROLE_OVERRIDE=true
    CFG

    block_imds='iptables -C DOCKER-USER -i docker+ -d 169.254.169.254/32 -j DROP 2>/dev/null || iptables -I DOCKER-USER -i docker+ -d 169.254.169.254/32 -j DROP'
    mkdir -p /etc/systemd/system/docker.service.d
    cat > /etc/systemd/system/docker.service.d/50-block-imds.conf <<UNIT
    [Service]
    ExecStartPost=/bin/sh -c '$block_imds'
    UNIT
    systemctl daemon-reload
    if systemctl is-active --quiet docker; then sh -c "$block_imds"; fi

    # Session Manager is the only way in and the probe needs the CLI; neither
    # is guaranteed on the ECS AMI. dnf is a no-op when both are present.
    dnf install -y amazon-ssm-agent awscli-2
    systemctl enable --now amazon-ssm-agent
  EOT

  # The host drifts from the recommended AMI until a deliberate, scheduled
  # replacement (-replace, which also repoints the VPC origins); weekly
  # patching keeps it current in place.
  lifecycle {
    ignore_changes = [ami]
  }

  # The ECS and SSM agents register at first boot with these policies, and
  # cloud-init's dnf needs the egress rule (the SG has no inline egress).
  depends_on = [aws_iam_role_policy_attachment.host_managed, aws_vpc_security_group_egress_rule.host_all]

  tags = merge(local.tags, { Name = "${local.prefix}-ecs-host" })
}

# Sunday 21:30 UTC (03:00 IST Monday), far from the 06:00 UTC cron. Only on
# the schedule: a reboot during platform-up would interrupt the bring-up.
resource "aws_ssm_association" "host_patch" {
  name                        = "AWS-RunPatchBaseline"
  association_name            = "${local.prefix}-host-patch"
  schedule_expression         = "cron(30 21 ? * SUN *)"
  apply_only_at_cron_interval = true

  parameters = {
    Operation    = "Install"
    RebootOption = "RebootIfNeeded"
  }

  targets {
    key    = "InstanceIds"
    values = [aws_instance.host.id]
  }
}

# Host check every 30 minutes, one HostUnhealthy datapoint. 1 when a task
# reached 169.254.169.254 in a 2 s TCP connect (the DOCKER-USER rule is gone),
# a probe could not run in a task, no task was running to probe, or the root
# volume is over 85 % (uploads spool into container layers there, and a full
# disk stops all three services). The Run Command output names the reason.
resource "aws_ssm_association" "host_probe" {
  name                = "AWS-RunShellScript"
  association_name    = "${local.prefix}-host-probe"
  schedule_expression = "rate(30 minutes)"

  parameters = {
    commands = <<-EOT
      unhealthy=0
      probed=0
      for c in $(docker ps -q --filter label=com.amazonaws.ecs.task-arn); do
        probed=$((probed + 1))
        out=$(docker exec "$c" python -c "import socket; s=socket.socket(); s.settimeout(2); print('reachable' if s.connect_ex(('169.254.169.254', 80)) == 0 else 'blocked')" 2>&1)
        if [ "$out" != blocked ]; then unhealthy=1; echo "task container $c: $${out:-no output}"; fi
      done
      if [ "$probed" -eq 0 ]; then unhealthy=1; echo "no running task to probe"; fi
      disk=$(df --output=pcent / | tail -n 1 | tr -dc 0-9)
      if [ "$${disk:-100}" -gt 85 ]; then unhealthy=1; echo "root volume $${disk:-?}% used"; fi
      aws cloudwatch put-metric-data --region ${data.aws_region.current.region} --namespace ${local.host_metric_namespace} --metric-name HostUnhealthy --value "$unhealthy"
    EOT
  }

  targets {
    key    = "InstanceIds"
    values = [aws_instance.host.id]
  }
}
