# One repository per service image (api, gateway, assistant, web).
# NOTE: repository names carry no environment segment ("pattadar/api"); when
# dev and prod share one AWS account, only one env can own them — dev should
# reuse prod's repositories (see README).

resource "aws_ecr_repository" "service" {
  for_each = var.manage_ecr ? local.services : toset([])

  name = "${var.app_name}/${each.key}"

  image_scanning_configuration {
    scan_on_push = true
  }

  # IMMUTABLE: deploy.yml pushes one tag per release SHA and
  # scripts/deploy-release.py resolves it to a digest, so nothing ever needs to
  # re-point a tag. A re-run of a failed deploy job must therefore be triggered
  # from a new commit, not by re-pushing the same SHA.
  image_tag_mutability = "IMMUTABLE"
  tags                 = local.tags
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each = aws_ecr_repository.service

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged layers after ${var.ecr_untagged_expiry_days} days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = var.ecr_untagged_expiry_days
        }
        action = {
          type = "expire"
        }
      },
      {
        # A tagStatus "any" rule must be last — ECR rejects the policy
        # otherwise.
        rulePriority = 2
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
