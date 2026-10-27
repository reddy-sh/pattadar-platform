# Account bootstrap (one-time, founder checklist)

Do these in order. Everything after step 5 assumes the AWS CLI works and
`aws sts get-caller-identity` returns the pattadar account.

## 1. Fix the AWS CLI (ARM64)

```sh
brew install awscli
hash -r
aws --version          # expect aws-cli/2.x, arm64
which aws              # expect /opt/homebrew/bin/aws
```

## 2. Configure credentials

```sh
aws configure          # region: ap-south-1, output: json
aws sts get-caller-identity
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

## 3. Root MFA + alternate security contact

- Console → sign in as **root** → Security credentials → **Assign MFA device**
  (authenticator app). Do this before anything else.
- Alternate security contact (so security notices never depend on one inbox):

```sh
aws account put-alternate-contact \
  --alternate-contact-type SECURITY \
  --name "Sankara Telukutla" \
  --email-address sankara.telukutla@gmail.com \
  --phone-number "+91XXXXXXXXXX" \
  --title "Founder"
```

## 4. Account-wide S3 public-access block + EBS default encryption

```sh
aws s3control put-public-access-block --account-id "$ACCOUNT_ID" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws ec2 enable-ebs-encryption-by-default --region ap-south-1
```

## 5. Terraform state bucket (bootstrap — the only hand-made bucket)

```sh
aws s3api create-bucket \
  --bucket "pattadar-terraform-state-${ACCOUNT_ID}" \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1

aws s3api put-bucket-versioning \
  --bucket "pattadar-terraform-state-${ACCOUNT_ID}" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "pattadar-terraform-state-${ACCOUNT_ID}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-encryption \
  --bucket "pattadar-terraform-state-${ACCOUNT_ID}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
```

Then uncomment the `backend "s3"` blocks in
`infra/terraform/envs/*/{persistent,runtime}/backend.tf`, replace
`<ACCOUNT_ID>`, and run `terraform init` in each root.

## 6. Budget + Cost Anomaly Detection

```sh
aws budgets create-budget --account-id "$ACCOUNT_ID" \
  --budget '{"BudgetName":"pattadar-monthly","BudgetLimit":{"Amount":"150","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[
    {"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},
     "Subscribers":[{"SubscriptionType":"EMAIL","Address":"sankara.telukutla@gmail.com"}]},
    {"Notification":{"NotificationType":"FORECASTED","ComparisonOperator":"GREATER_THAN","Threshold":100,"ThresholdType":"PERCENTAGE"},
     "Subscribers":[{"SubscriptionType":"EMAIL","Address":"sankara.telukutla@gmail.com"}]}]'
```

Cost Anomaly Detection (console): Billing and Cost Management → **Cost Anomaly
Detection** → Create monitor → "AWS services" (all) → alert subscription: daily
summaries to the same email.

The prod persistent Terraform now declares a $50 monthly budget and an
"AWS services" anomaly monitor (`modules/persistent/budgets.tf`). It is code
only and not applied (docs/specs/TODO-prod-persistent-pending.md). An account
can hold only one AWS-services monitor, so before that apply, import any
monitor created here or point the subscription at it, rather than creating a
second.

## 7. Install Terraform (>= 1.10)

```sh
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform -version
```

## 8. EC2 vCPU and CloudFront timeout quotas

The runtime is one `t4g.medium` (2 vCPUs). A deliberate host replacement runs
two hosts briefly, so 4 vCPUs is the floor.

```sh
aws service-quotas get-service-quota \
  --service-code ec2 --quota-code L-1216C47A   # Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) vCPUs
```

CloudFront "Response timeout per origin" is the budget for the synchronous
readings (default use 120 s). Request 180 s in the Service Quotas console
(us-east-1 → Amazon CloudFront → "Response timeout per origin"). Once it is
granted, set `cloudfront_origin_read_timeout = 180` in `envs/prod/runtime`
through a reviewed change. Both the quota request and the apply need Reddy's
approval. The request does not replace the cutover gate that moves the iOS
passbook read to the async route
([decision](../specs/2026-10-26-one-server-runtime.md)).

## 9. SES sandbox exit

Console → Amazon SES (ap-south-1) → **Account dashboard** → "Request production
access": mail type = Transactional, website = https://pattadar.com, describe the
use case (login/verification/inactivity notifications to registered family
members, low volume, opt-in only, bounces handled via SES suppression list).
Approval usually < 24h. Until then SES only delivers to verified identities.

## 10. pattadar.com NS switch (Azure DNS → Route53) — Track B

The Route53 zone is created by the persistent layer; the live site keeps
working on Azure DNS until the registrar NS switch. Order matters:

1. **Export current Azure records** (keep this as the rollback map):

   ```sh
   az network dns record-set list \
     --resource-group <rg> --zone-name pattadar.com --output table
   ```

   (or portal → DNS zone → Export zone file.)

2. **Recreate the needed records in Route53 FIRST** — the site stays live
   because both providers serve identical answers. Terraform manages the new
   platform records (apex/`www` → the SPA CloudFront distribution, `api` →
   the api CloudFront distribution, A and AAAA); add any Azure-era
   records you must keep (e.g. existing MX/TXT verifications) to the zone too.

   ```sh
   terraform -chdir=infra/terraform/envs/prod/persistent output route53_zone_id
   aws route53 list-resource-record-sets --hosted-zone-id <zone-id>   # compare against the Azure export
   ```

3. **TTL notes**: drop TTLs on the Azure records to 300s a day before the
   switch. NS delegations themselves are cached up to 48h — plan for both
   providers to answer during that window (which is why step 2 comes first).

4. **Switch NS at the registrar** to the 4 values from:

   ```sh
   terraform -chdir=infra/terraform/envs/prod/persistent output route53_name_servers
   ```

5. **Verify** (repeat over 24–48h):

   ```sh
   dig NS pattadar.com +short                 # should list awsdns servers
   dig pattadar.com A +short
   dig www.pattadar.com +short
   dig api.pattadar.com +short
   dig @8.8.8.8 pattadar.com +short           # public resolver view
   ```

6. Only after verification is clean for 48h: delete the Azure DNS zone.

## 11. App SSM SecureStrings

After the persistent apply (it creates the CMK `alias/pattadar-<env>`) and
before the first runtime apply. Repeat per environment. Every command here
writes to AWS, so Reddy runs it or approves it for that environment.

The runtime reads five SecureStrings that live outside Terraform. Their values
never enter state or tfvars, and platform-down never deletes them.
`scripts/platform-up.sh` refuses to apply while any of them is missing.

| Name (`/pattadar/<env>/…`) | Read by | Value |
|---|---|---|
| `db-app-password` | all three services as `PG_PASSWORD` | must match the `pattadar_app` role in the database (reserved, see below) |
| `cron-secret` | api `CRON_SECRET`, and the scheduler connection (the one value that enters state) | copy `pattadar/<env>/cron-secret` from Secrets Manager |
| `anthropic-api-key` | gateway, api and assistant `ANTHROPIC_API_KEY` | copy `pattadar/<env>/anthropic-api-key` from Secrets Manager |
| `internal-proxy-secret-api` | gateway `INTERNAL_PROXY_SECRET_API`, api `INTERNAL_PROXY_SECRET` | new random value |
| `internal-proxy-secret-assistant` | gateway `INTERNAL_PROXY_SECRET_ASSISTANT`, assistant `INTERNAL_PROXY_SECRET` | new random value, never the same as the api one |

Pass each value through a private file, never on the command line, and delete
the file afterwards. `tr -d '\n'` keeps a trailing newline out of the value.
Always pass `--key-id`: `scripts/platform-up.sh` refuses a parameter under the
default `aws/ssm` key, which any principal in the account, the ECS instance
role included, can decrypt through SSM.

```sh
ENV=prod                       # or dev
umask 077; d=$(mktemp -d)
put() {                        # put <name> <file>
  aws ssm put-parameter --type SecureString --key-id "alias/pattadar-${ENV}" \
    --name "/pattadar/${ENV}/$1" --value "file://$2"
}

for n in cron-secret anthropic-api-key; do
  aws secretsmanager get-secret-value --secret-id "pattadar/${ENV}/$n" \
    --query SecretString --output text | tr -d '\n' > "$d/$n"
  put "$n" "$d/$n"
done
for n in internal-proxy-secret-api internal-proxy-secret-assistant; do
  openssl rand -hex 32 | tr -d '\n' > "$d/$n"
  put "$n" "$d/$n"
done
rm -rf "$d"
```

`db-app-password` is **reserved for Reddy**. The old runtime secret
`pattadar/<env>/db-app-password` was destroyed with the runtime, so its value
is probably past recovery. Generate a new value
(`openssl rand -base64 30 | tr -d '/+=\n'`), store it the same way, and set it
on the role as the RDS master user, whose credential is the RDS-managed secret
(`rds_master_secret_arn` output). RDS is not public, so connect through an SSM
port-forward on the ECS host. Run `ALTER ROLE pattadar_app PASSWORD '…'` on a
restored database, or create the role and the `hub` database on a fresh one,
as `scripts/platform-up.sh` prints. The order is forced: the parameter must
exist before `platform-up.sh` applies, but the role can only be changed once
RDS and the host are up. So store the parameter, run the up, and expect its
smoke to fail on database login. Then run the SQL, force a new deployment of
the three services, and re-run the smoke. Each step needs Reddy's approval.

Verify with names only, never values:

```sh
aws ssm describe-parameters \
  --parameter-filters "Key=Name,Option=BeginsWith,Values=/pattadar/${ENV}/" \
  --query "Parameters[].[Name,Type]" --output table
```

Changing a value later is `put-parameter --overwrite` (approved). The services
read it only at task start, so restart the services that share it together.
For a proxy secret that means the gateway and its target; while they disagree,
the target answers 403. Never `delete-parameter`: deletion is immediate and
permanent, and losing `db-app-password` forces the reserved `ALTER ROLE`.
