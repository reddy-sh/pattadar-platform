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

## 7. Install Terraform (>= 1.10)

```sh
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform -version
```

## 8. Fargate vCPU quota

```sh
aws service-quotas get-service-quota \
  --service-code fargate --quota-code L-3032A538   # Fargate On-Demand vCPU

# If the value is < 16 (fresh accounts often start at 6):
aws service-quotas request-service-quota-increase \
  --service-code fargate --quota-code L-3032A538 --desired-value 20
```

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
   platform records (apex/`www` → CloudFront, `api` → ALB); add any Azure-era
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
