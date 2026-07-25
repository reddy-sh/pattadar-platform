# One repository per service image (api, gateway, assistant).

resource "aws_ecr_repository" "service" {
  for_each = local.services

  name = "${var.app_name}/${each.key}"

  image_scanning_configuration {
    scan_on_push = true
  }

  image_tag_mutability = "MUTABLE"
  tags                 = local.tags
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each = aws_ecr_repository.service

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.ecr_keep_last_images} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_keep_last_images
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
