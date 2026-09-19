# ECS cluster + ARM64 Fargate services (gateway, api, assistant, web).
#
# assign_public_ip = true is REQUIRED: the tasks sit in public subnets with no
# NAT, so without a public IP they cannot reach ECR/Secrets Manager/Logs and
# die at launch with CannotPullContainerError. (Public IPv4 ~= $3.6/mo/task.)
#
# gateway -> api traffic uses ECS Service Connect: the api service registers
# as "api" in the namespace, gateway calls http://api:8080 (api_sg admits
# gateway_sg on 8080).

resource "aws_ecs_cluster" "main" {
  name = local.prefix

  setting {
    # Insights' custom metrics were the entire CloudWatch bill (~$18/mo across
    # both envs, Aug 2026) while log ingestion rounded to $0; the free CPU/mem
    # alarms in observability.tf cover pre-launch monitoring.
    name  = "containerInsights"
    value = "disabled"
  }

  tags = local.tags
}

resource "aws_service_discovery_http_namespace" "main" {
  name        = local.prefix
  description = "Service Connect namespace (gateway -> api)"

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

# Secrets injection at task start: exactly the three ARNs the task defs
# reference, plus kms:Decrypt via the persistent CMK they are encrypted with.
data "aws_iam_policy_document" "execution_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = concat([
      local.persistent.secret_arns["anthropic-api-key"],
      local.persistent.secret_arns["cron-secret"],
      aws_secretsmanager_secret.db_dsn.arn,
      aws_secretsmanager_secret.db_app_password.arn,
      ], var.enable_aadhaar_legacy_fernet ? [
      local.persistent.secret_arns["aadhaar-legacy-fernet-key"],
    ] : [], values(var.payment_secret_arns))
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

resource "aws_ecs_task_definition" "gateway" {
  family                   = "${local.prefix}-gateway"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.gateway_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "gateway"
      image     = "${local.persistent.ecr_repository_urls["gateway"]}:${var.gateway_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "gateway"
          containerPort = 8080
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
        { name = "API_BASE_URL", value = "http://api:8080" },
        { name = "ASSISTANT_BASE_URL", value = "http://assistant:8080" },
        { name = "IDENTITY_LEGACY_BINDINGS", value = var.identity_legacy_bindings == null ? "" : jsonencode(var.identity_legacy_bindings) },
        { name = "ADMIN_SUBJECT_IDS", value = join(",", var.admin_subject_ids) },
      ]

      secrets = [
        { name = "PG_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = local.persistent.secret_arns["anthropic-api-key"] },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["gateway"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "gateway"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${local.persistent.ecr_repository_urls["api"]}:${var.api_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "api"
          containerPort = 8080
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
      ]

      # CRON_SECRET is ALWAYS set (invariant): /cron/inactivity-check rejects
      # callers without the matching x-cron-secret header.
      secrets = concat([
        { name = "ANTHROPIC_API_KEY", valueFrom = local.persistent.secret_arns["anthropic-api-key"] },
        { name = "CRON_SECRET", valueFrom = local.persistent.secret_arns["cron-secret"] },
        { name = "APP_PG_DSN", valueFrom = aws_secretsmanager_secret.db_dsn.arn },
        ], var.enable_aadhaar_legacy_fernet ? [
        { name = "AADHAAR_ENC_KEY", valueFrom = local.persistent.secret_arns["aadhaar-legacy-fernet-key"] },
      ] : [], [for name, arn in var.payment_secret_arns : { name = name, valueFrom = arn }])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["api"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])

  tags = local.tags
}

# --- Services ----------------------------------------------------------------

resource "aws_ecs_service" "gateway" {
  name            = "gateway"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.gateway.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.gateway.id]
    assign_public_ip = true # no NAT: required to pull from ECR (see header note)
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.gateway.arn
    container_name   = "gateway"
    container_port   = 8080
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
    # Client-only: gateway resolves "api" but registers nothing itself.
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.https]

  tags = local.tags
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true # no NAT: required to pull from ECR (see header note)
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name = "api"

      client_alias {
        port     = 8080
        dns_name = "api"
      }
    }
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.https]

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
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.assistant_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "assistant"
      image     = "${local.persistent.ecr_repository_urls["assistant"]}:${var.assistant_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "assistant"
          containerPort = 8080
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
        { name = "PG_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn },
        { name = "PUBLIC_RECORDS_PG_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = local.persistent.secret_arns["anthropic-api-key"] },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["assistant"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "assistant"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "assistant" {
  name            = "assistant"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.assistant.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.assistant.id]
    assign_public_ip = true # no NAT: required to pull from ECR (see header note)
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name = "assistant"

      client_alias {
        port     = 8080
        dns_name = "assistant"
      }
    }
  }

  tags = local.tags
}

# --- Web (Next.js SSR; ALB-fronted, container port 3000) --------------------
#
# Cognito config is baked into the image at build time (NEXT_PUBLIC_* build
# args, see apps/web-next/Dockerfile), so the task needs no runtime secrets.
# Not deployed until the web-migration cutover (D4); until then desired_count
# is 0 in dev and the web target group simply has no registered targets.
# Task definition + service are gated on local.web_enabled (web repo present
# in the persistent layer); the IAM role and target group are free and stay
# unconditional — the ALB HTTPS listener's default action needs the TG.

resource "aws_iam_role" "web_task" {
  name               = "${local.prefix}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

resource "aws_ecs_task_definition" "web" {
  count = local.web_enabled ? 1 : 0

  family                   = "${local.prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.web_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${local.persistent.ecr_repository_urls["web"]}:${var.web_image_tag}"
      essential = true

      portMappings = [
        {
          name          = "web"
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "PORT", value = "3000" },
        { name = "NODE_ENV", value = "production" },
        { name = "AWS_REGION", value = data.aws_region.current.region },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service["web"].name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "web" {
  count = local.web_enabled ? 1 : 0

  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web[0].arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true # no NAT: required to pull from ECR (see header note)
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
    # Client-only: web resolves "api"/"assistant" if it ever needs to, but
    # registers nothing itself (it is reached via the ALB, like gateway).
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener.https]

  tags = local.tags
}
