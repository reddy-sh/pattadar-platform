# TODO — pending changes in the prod persistent Terraform root

Found on 27/09/2026 while applying the Google `picture` mapping for Profile.
A full `terraform plan` in `infra/terraform/envs/prod/persistent` that day
showed **24** pending changes, not the two first noticed. Nothing on the list
below has been applied except where marked.

## Done

- **`aadhaar-legacy-fernet-key` secret container** — created 27/09/2026 by a
  targeted apply whose plan held exactly that one create (Reddy's approval).
  It is an empty container: no value, no versions. Populate it only per
  [aadhaar-kms-rollout.md](../runbooks/aadhaar-kms-rollout.md) (count-only
  inventory, named custodian, explicit approval), or remove it from
  `secrets.tf` if the bridge is not needed.
- **Google IdP `picture` mapping** — applied 27/09/2026 with
  `aws cognito-idp update-identity-provider` (mapping only); Terraform shows no
  mapping difference.

## Still pending (each needs its own review and approval)

Grouped from the 27/09/2026 plan. Changed key names only; re-plan before acting.

- **Identity / Aadhaar:** create `aws_kms_key.aadhaar` + alias (the KMS
  rollout's own key). Google IdP `provider_details` shows as known-after-apply
  (re-read from `idp-social`; expected to be a no-op, unconfirmed).
- **Cognito clients:** create `user_pool_client.local_dev` and its managed-login
  branding; update `user_pool_client.spa` callback/logout URLs.
- **CI/CD trust (IAM):** update `github_deploy` policy and trust policy,
  `github_governance` trust policy, replace its read-only attachment.
- **Storage:** documents bucket CORS (create), lifecycle rules and bucket
  policy (update).
- **Audit:** CloudTrail event selectors (update) and **S3 Object Lock on the
  CloudTrail bucket (create) — effectively irreversible once enabled.**
- **ECR:** image tag mutability on four repositories; replace four lifecycle
  policies.
- **GuardDuty features (added 25/10/2026, code only):** three
  `aws_guardduty_detector_feature.pinned` creates — S3_DATA_EVENTS ENABLED,
  RDS_LOGIN_EVENTS DISABLED (~$2.38/month while RDS runs; turn on at launch),
  RUNTIME_MONITORING DISABLED. Live feature state is unknown, so the saving may
  be $0. The Malware Protection plan is unchanged.
- **Cost guardrails (added 26/10/2026, code only):** `modules/persistent/budgets.tf`
  creates a $50 monthly cost budget that excludes credits and refunds, emailing
  at 90% actual and 100% forecast, plus a Cost Anomaly Detection AWS-services
  monitor with a daily email above $5 of impact. Both are free (AWS pricing
  pages, 26/10/2026). Nothing is created until `budget_alert_emails` is set in
  the git-ignored `prod.auto.tfvars`. Before the apply, check for an existing
  AWS-services monitor: AWS allows one per account and auto-creates it for
  newer Cost Explorer accounts. If one exists, import it with a root `import`
  block or the create fails. Land that import in the same reviewed change that
  sets `budget_alert_emails`: `scripts/platform-up.sh` step 1 applies
  persistent with `-auto-approve`, so a failed create aborts every bring-up
  before the runtime is touched.

Each needs a fresh plan, Reddy's approval and a fresh confirmation right before
`terraform apply`. A `-target` on anything that reads a Secrets Manager secret
pulls the whole `aws_secretsmanager_secret.app` set into the plan.
