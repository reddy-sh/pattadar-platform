# SES domain identity for pattadar.com + Easy DKIM + custom MAIL FROM + DMARC.
#
# The identity stays "pending verification" until the registrar NS switch
# makes these Route53 records authoritative (Track B). TODO(Track B): request
# production access (sandbox exit) via console/CLI — it is not a Terraform
# resource:
#   aws sesv2 put-account-details --production-access-enabled ...

resource "aws_ses_domain_identity" "main" {
  count = var.manage_dns ? 1 : 0

  domain = var.domain_name
}

resource "aws_route53_record" "ses_verification" {
  count = var.manage_dns ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "_amazonses.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main[0].verification_token]
}

# --- Easy DKIM (3 CNAMEs) ---------------------------------------------------

resource "aws_ses_domain_dkim" "main" {
  count = var.manage_dns ? 1 : 0

  domain = aws_ses_domain_identity.main[0].domain
}

resource "aws_route53_record" "ses_dkim" {
  count = var.manage_dns ? 3 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# --- Custom MAIL FROM: mail.pattadar.com ------------------------------------

resource "aws_ses_domain_mail_from" "main" {
  count = var.manage_dns ? 1 : 0

  domain           = aws_ses_domain_identity.main[0].domain
  mail_from_domain = "mail.${var.domain_name}"

  behavior_on_mx_failure = "UseDefaultValue"
}

resource "aws_route53_record" "mail_from_mx" {
  count = var.manage_dns ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${data.aws_region.current.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  count = var.manage_dns ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = aws_ses_domain_mail_from.main[0].mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# --- DMARC (monitor-only to start) ------------------------------------------

resource "aws_route53_record" "dmarc" {
  count = var.manage_dns ? 1 : 0

  zone_id = aws_route53_zone.main[0].zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none; rua=mailto:${var.dmarc_rua_email}"]
}
