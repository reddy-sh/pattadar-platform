# Public hosted zone for pattadar.com — ZONE ONLY. The runtime layer adds the
# A/AAAA alias records (CloudFront, ALB) via terraform_remote_state.
#
# pattadar.com currently lives on Azure DNS; the existing site stays up until
# the registrar NS switch (Track B, see runbooks). The `name_servers` output
# gives the founder the 4 NS values needed for that switch.

resource "aws_route53_zone" "main" {
  count = var.manage_dns ? 1 : 0

  name    = var.domain_name
  comment = "${local.prefix} — managed by Terraform (persistent layer)"
  tags    = local.tags
}
