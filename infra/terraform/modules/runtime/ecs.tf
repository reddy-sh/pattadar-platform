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
    name  = "containerInsights"
    value = "enabled"
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
    resources = [
      local.persistent.secret_arns["anthropic-api-key"],
      local.persistent.secret_arns["cron-secret"],
      aws_secretsmanager_secret.db_dsn.arn,
      aws_secretsmanager_secret.db_app_password.arn,
    ]
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

# api: nothing beyond what the execution role already provides (logs). It
# talks to RDS/Anthropic over the network with injected secrets, not AWS APIs.
resource "aws_iam_role" "api_task" {
  name               = "${local.prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
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
        { name = "STORAGE_BUCKET", value = local.persistent.documents_bucket_name },
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
        { name = "ADMIN_USER_IDS", value = "sankara.telukutla" },
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
        { name = "APP_PUBLIC_URL", value = "https://${var.web_domain}" },
      ]

      # CRON_SECRET is ALWAYS set (invariant): /cron/inactivity-check rejects
      # callers without the matching x-cron-secret header.
      secrets = [
        { name = "ANTHROPIC_API_KEY", valueFrom = local.persistent.secret_arns["anthropic-api-key"] },
        { name = "CRON_SECRET", valueFrom = local.persistent.secret_arns["cron-secret"] },
        { name = "APP_PG_DSN", valueFrom = aws_secretsmanager_secret.db_dsn.arn },
      ]

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

# --- Assistant (ported service; MCP_URL empty = built-in tools only) ---------

resource "aws_iam_role" "assistant_task" {
  name               = "${local.prefix}-assistant-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
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
        { name = "MCP_URL", value = "" },
      ]

      secrets = [
        { name = "PG_PASSWORD", valueFrom = aws_secretsmanager_secret.db_app_password.arn },
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

resource "aws_iam_role" "web_task" {
  name               = "${local.prefix}-web-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
  tags               = local.tags
}

resource "aws_ecs_task_definition" "web" {
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
  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.desired_count
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
