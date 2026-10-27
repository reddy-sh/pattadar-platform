# ECS cluster + gateway/api/assistant as EC2-launch services on the one host
# (ec2.tf), bridge mode, static host ports: gateway 8080, api 8081, assistant
# 8082. Every container still listens on 8080.
#
# The gateway reaches the api and assistant through the docker0 gateway
# (http://172.17.0.1:<hostPort>). Any co-resident container can reach those
# ports too, so isolation is the per-target internal proxy secret, not a
# security group: the api refuses every request without its secret except
# /health and /cron/inactivity-check, and the assistant never holds the api's.
#
# Deploys are min 0 / max 100 (a static host port cannot be bound twice), so
# each service has a short outage per release (Reddy accepted, 26/10/2026).

# Never rename or otherwise replace the cluster: the VPC origins'
# create_before_destroy reaches it through the host, so a replacement would
# create the same name first and then delete it.
resource "aws_ecs_cluster" "main" {
  name = local.prefix

  setting {
    # Insights' custom metrics were the entire CloudWatch bill (~$18/mo across
    # both envs, Aug 2026) while log ingestion rounded to $0; the alarms in
    # observability.tf cover pre-launch monitoring without it.
    name  = "containerInsights"
    value = "disabled"
  }

  tags = local.tags
}

# --- IAM: execution role (shared) -------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

# ECR pulls + awslogs.
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Secrets injection at task start: exactly the five SSM parameters the task
# defs reference, the still-optional Secrets Manager ARNs (legacy fernet,
# Razorpay) when enabled, plus kms:Decrypt via the persistent CMK.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = values(local.ssm_arns)
  }

  dynamic "statement" {
    for_each = var.enable_aadhaar_legacy_fernet || length(var.payment_secret_arns) > 0 ? [1] : []

    content {
      actions = ["secretsmanager:GetSecretValue"]
      resources = concat(var.enable_aadhaar_legacy_fernet ? [
        local.persistent.secret_arns["aadhaar-legacy-fernet-key"],
      ] : [], values(var.payment_secret_arns))
    }
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = [local.persistent.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "secrets-injection"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

# --- IAM: task roles ---------------------------------------------------------

# gateway: documents-bucket rw (+ CMK for its SSE-KMS objects) and SES send.
resource "aws_iam_role" "gateway_task" {
  name               = "${local.prefix}-gateway-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "gateway_task" {
  statement {
    sid = "DocumentsBucketRW"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      local.persistent.documents_bucket_arn,
      "${local.persistent.documents_bucket_arn}/*",
    ]
  }

  statement {
    sid = "DocumentsBucketKms"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [local.persistent.kms_key_arn]
  }

  # SES send, scoped to the verified pattadar.com identity. Skipped when this
  # env's persistent layer does not manage the SES identity (shared-account
  # dev, ses_identity_arn = null) — dev then cannot send email, by design.
  dynamic "statement" {
    for_each = local.ses_identity_arn != null ? [1] : []

    content {
      sid = "SesSendScopedToIdentity"
      actions = [
        "ses:SendEmail",
        "ses:SendRawEmail",
      ]
      resources = [local.ses_identity_arn]
    }
  }
}

resource "aws_iam_role_policy" "gateway_task" {
  name   = "gateway-task"
  role   = aws_iam_role.gateway_task.id
  policy = data.aws_iam_policy_document.gateway_task.json
}

# api: direct field encryption only on the dedicated Aadhaar CMK. Network
# access to RDS/providers remains separate from this task-role permission.
resource "aws_iam_role" "api_task" {
  name               = "${local.prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "api_task" {
  statement {
    sid       = "AadhaarFieldEncryption"
    actions   = ["kms:Encrypt", "kms:Decrypt"]
    resources = [local.persistent.aadhaar_kms_key_arn]

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:app"
      values   = [var.app_name]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:environment"
      values   = [var.environment]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:schema"
      values   = ["v1"]
    }

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:purpose"
      values   = ["aadhaar-*"]
    }
  }
}

resource "aws_iam_role_policy" "api_task" {
  name   = "api-task"
  role   = aws_iam_role.api_task.id
  policy = data.aws_iam_policy_document.api_task.json
}

# --- Task definitions --------------------------------------------------------

locals {
  # Shared kernel: every container drops all capabilities, cannot gain new
  # privileges and runs under an init process (ECS_DISABLE_PRIVILEGED on the
  # host refuses privileged tasks). A short stop keeps the deploy gap short.
  container_hardening = {
    linuxParameters = {
      capabilities       = { drop = ["ALL"] }
      initProcessEnabled = true
    }
    dockerSecurityOptions = ["no-new-privileges"]
    stopTimeout           = 10
  }

  # No target group checks the tasks any more, so ECS replaces a wedged
  # container itself. Failures inside startPeriod do not count.
  health_check = {
    command  = ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3).status == 200 else 1)\""]
    interval = 30
    timeout  = 5
    retries  = 3
  }
}

resource "aws_ecs_task_definition" "gateway" {
  family                   = "${local.prefix}-gateway"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.gateway_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    merge(local.container_hardening, {
      name      = "gateway"
      image     = "${local.persistent.ecr_repository_urls["gateway"]}:${var.gateway_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "gateway"
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]

      # Cognito wiring is plain env: pool id / client id / issuer are public
      # identifiers, not secrets.
      environment = [
        { name = "PORT", value = "8080" },
        { name = "AWS_REGION", value = data.aws_region.current.region },
        { name = "APP_ENV", value = var.environment },
        { name = "STORAGE_BUCKET", value = local.persistent.documents_bucket_name },
        { name = "STORAGE_KMS_KEY_ARN", value = local.persistent.kms_key_arn },
        { name = "STORAGE_MAX_UPLOAD_BYTES", value = "104857600" },
        { name = "PG_HOST", value = aws_db_instance.main.address },
        { name = "PG_PORT", value = "5432" },
        { name = "PG_USER", value = "pattadar_app" },
        { name = "PG_DATABASE", value = "hub" },
        { name = "COGNITO_USER_POOL_ID", value = local.persistent.cognito_user_pool_id },
        # Comma-separated allowlist: the gateway accepts tokens minted for the
        # web SPA or the native iOS client, and nothing else. try() keeps the
        # runtime plannable until persistent has been applied with the mobile
        # client output.
        { name = "COGNITO_CLIENT_ID", value = join(",", compact([
          local.persistent.cognito_spa_client_id,
          try(local.persistent.cognito_mobile_client_id, ""),
        ])) },
        { name = "COGNITO_REGION", value = data.aws_region.current.region },
        # docker0 gateway -> the api/assistant host ports on this host.
        { name = "API_BASE_URL", value = "http://172.17.0.1:8081" },
        { name = "ASSISTANT_BASE_URL", value = "http://172.17.0.1:8082" },
        # Above CloudFront's 60 s origin keep-alive, so an idle connection is
        # never closed under a request (502).
        { name = "UVICORN_TIMEOUT_KEEP_ALIVE", value = "65" },
        { name = "IDENTITY_LEGACY_BINDINGS", value = var.identity_legacy_bindings == null ? "" : jsonencode(var.identity_legacy_bindings) },
        { name = "ADMIN_SUBJECT_IDS", value = join(",", var.admin_subject_ids) },
      ]

      # One secret per target: the assistant never holds the api's value.
      secrets = [
        { name = "PG_PASSWORD", valueFrom = local.ssm_arns["db-app-password"] },
        { name = "ANTHROPIC_API_KEY", valueFrom = local.ssm_arns["anthropic-api-key"] },
        { name = "INTERNAL_PROXY_SECRET_API", valueFrom = local.ssm_arns["internal-proxy-secret-api"] },
        { name = "INTERNAL_PROXY_SECRET_ASSISTANT", valueFrom = local.ssm_arns["internal-proxy-secret-assistant"] },
      ]

      healthCheck = merge(local.health_check, { startPeriod = 60 })

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["gateway"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "gateway"
        }
      }
    })
  ])

  tags = local.tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    merge(local.container_hardening, {
      name      = "api"
      image     = "${local.persistent.ecr_repository_urls["api"]}:${var.api_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "api"
          containerPort = 8080
          hostPort      = 8081
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "8080" },
        { name = "AWS_REGION", value = data.aws_region.current.region },
        { name = "APP_ENV", value = var.environment },
        { name = "AADHAAR_KMS_KEY_ARN", value = local.persistent.aadhaar_kms_key_arn },
        { name = "AADHAAR_KMS_WRITES_ENABLED", value = var.aadhaar_kms_writes_enabled ? "1" : "0" },
        { name = "AADHAAR_LEGACY_WRITE_BRIDGE", value = var.enable_aadhaar_legacy_fernet ? "1" : "0" },
        { name = "APP_PUBLIC_URL", value = "https://${var.web_domain}" },
        { name = "PAYMENTS_MODE", value = var.payments_mode },
        { name = "RAZORPAY_LIVE_CONFIRMED", value = var.razorpay_live_confirmed ? "1" : "0" },
        # Same pattadar_app parts the gateway and assistant take. The api used
        # to receive a DSN composed from the RDS-managed MASTER credential,
        # which rotates ~7d and stranded every new connection until an
        # operator re-applied; the master credential is no longer deployed.
        { name = "PG_HOST", value = aws_db_instance.main.address },
        { name = "PG_PORT", value = "5432" },
        { name = "PG_USER", value = "pattadar_app" },
        { name = "PG_DATABASE", value = "hub" },
        { name = "UVICORN_TIMEOUT_KEEP_ALIVE", value = "65" },
      ]

      # CRON_SECRET is ALWAYS set (invariant): /cron/inactivity-check rejects
      # callers without the matching x-cron-secret header. INTERNAL_PROXY_SECRET
      # is the gateway-only value every other path demands (private_ingress).
      secrets = concat([
        { name = "ANTHROPIC_API_KEY", valueFrom = local.ssm_arns["anthropic-api-key"] },
        { name = "CRON_SECRET", valueFrom = local.ssm_arns["cron-secret"] },
        { name = "PG_PASSWORD", valueFrom = local.ssm_arns["db-app-password"] },
        { name = "INTERNAL_PROXY_SECRET", valueFrom = local.ssm_arns["internal-proxy-secret-api"] },
        ], var.enable_aadhaar_legacy_fernet ? [
        { name = "AADHAAR_ENC_KEY", valueFrom = local.persistent.secret_arns["aadhaar-legacy-fernet-key"] },
      ] : [], [for name, arn in var.payment_secret_arns : { name = name, valueFrom = arn }])

      # init_db runs its boot-time backfills before /health answers.
      healthCheck = merge(local.health_check, { startPeriod = 120 })

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["api"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "api"
        }
      }
    })
  ])

  tags = local.tags
}

# --- Services ----------------------------------------------------------------

resource "aws_ecs_service" "gateway" {
  name            = "gateway"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.gateway.arn

  # deploy-release.py registers digest-pinned revisions and points the service
  # at them. Terraform still owns the task-definition template (env, secrets,
  # roles), but must not drag the service back to the revision built from the
  # *_image_tag variables: those are mutable tags that no longer track a
  # release, so an apply would silently roll production back to stale images.
  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count = var.desired_count
  launch_type   = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Destroy drains the services before the host terminates.
  depends_on = [aws_instance.host]

  tags = local.tags
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn

  # deploy-release.py registers digest-pinned revisions and points the service
  # at them. Terraform still owns the task-definition template (env, secrets,
  # roles), but must not drag the service back to the revision built from the
  # *_image_tag variables: those are mutable tags that no longer track a
  # release, so an apply would silently roll production back to stale images.
  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count = var.desired_count
  launch_type   = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Destroy drains the services before the host terminates.
  depends_on = [aws_instance.host]

  tags = local.tags
}

# --- Assistant (FastAPI + Claude SDK + internal record tools) ----------------

resource "aws_iam_role" "assistant_task" {
  name               = "${local.prefix}-assistant-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "assistant_attachments" {
  role = aws_iam_role.assistant_task.id
  name = "durable-attachments"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.persistent.documents_bucket_arn}/assistant/*" },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = local.persistent.kms_key_arn }
    ]
  })
}

resource "aws_ecs_task_definition" "assistant" {
  family                   = "${local.prefix}-assistant"
  requires_compatibilities = ["EC2"]
  network_mode             = "bridge"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.assistant_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    merge(local.container_hardening, {
      name      = "assistant"
      image     = "${local.persistent.ecr_repository_urls["assistant"]}:${var.assistant_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "assistant"
          containerPort = 8080
          hostPort      = 8082
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "8080" },
        { name = "AWS_REGION", value = data.aws_region.current.region },
        { name = "PG_HOST", value = aws_db_instance.main.address },
        { name = "PG_PORT", value = "5432" },
        { name = "PG_USER", value = "pattadar_app" },
        { name = "PG_DATABASE", value = "hub" },
        { name = "PUBLIC_RECORDS_PG_HOST", value = aws_db_instance.main.address },
        { name = "PUBLIC_RECORDS_PG_PORT", value = "5432" },
        { name = "PUBLIC_RECORDS_PG_USER", value = "pattadar_app" },
        { name = "PUBLIC_RECORDS_PG_DATABASE", value = var.db_name },
        { name = "PUBLIC_RECORDS_SCHEMA", value = "land" },
        { name = "PUBLIC_RECORDS_EMBEDDINGS_ENABLED", value = "0" },
        { name = "ASSISTANT_ATTACHMENTS_BUCKET", value = local.persistent.documents_bucket_name },
        { name = "ASSISTANT_ATTACHMENTS_KMS_KEY_ARN", value = local.persistent.kms_key_arn },
      ]

      secrets = [
        { name = "PG_PASSWORD", valueFrom = local.ssm_arns["db-app-password"] },
        { name = "PUBLIC_RECORDS_PG_PASSWORD", valueFrom = local.ssm_arns["db-app-password"] },
        { name = "ANTHROPIC_API_KEY", valueFrom = local.ssm_arns["anthropic-api-key"] },
        { name = "INTERNAL_PROXY_SECRET", valueFrom = local.ssm_arns["internal-proxy-secret-assistant"] },
      ]

      # Without this ECS replaces the assistant only when the process exits: a
      # wedged event loop or an exhausted connection pool stays RUNNING while
      # every chat request times out.
      healthCheck = merge(local.health_check, { startPeriod = 30 })

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["assistant"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "assistant"
        }
      }
    })
  ])

  tags = local.tags
}

resource "aws_ecs_service" "assistant" {
  name            = "assistant"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.assistant.arn

  # deploy-release.py registers digest-pinned revisions and points the service
  # at them. Terraform still owns the task-definition template (env, secrets,
  # roles), but must not drag the service back to the revision built from the
  # *_image_tag variables: those are mutable tags that no longer track a
  # release, so an apply would silently roll production back to stale images.
  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count = var.desired_count
  launch_type   = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Destroy drains the services before the host terminates.
  depends_on = [aws_instance.host]

  tags = local.tags
}

# --- Web (dormant) -----------------------------------------------------------
#
# The web ECS service, task definition and target group went with the ALB
# (Reddy, 26/10/2026); the browser client ships as the static SPA. The role
# stays: it is free and the persistent deploy-role PassRole names it.

resource "aws_iam_role" "web_task" {
  name               = "${local.prefix}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}
