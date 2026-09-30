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

Each needs a fresh plan, Reddy's approval and a fresh confirmation right before
`terraform apply`. A `-target` on anything that reads a Secrets Manager secret
pulls the whole `aws_secretsmanager_secret.app` set into the plan.
