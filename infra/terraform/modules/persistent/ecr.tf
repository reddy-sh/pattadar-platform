# One repository per service image (api, gateway, assistant).
# NOTE: repository names carry no environment segment ("pattadar/api"); when
# dev and prod share one AWS account, only one env can own them — dev should
# reuse prod's repositories (see README).

resource "aws_ecr_repository" "service" {
  for_each = var.manage_ecr ? local.services : toset([])

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
