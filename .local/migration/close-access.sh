#!/usr/bin/env bash
# Revert the temporary RDS exposure after migration.
set -euo pipefail
export AWS_REGION=ap-south-1
MYIP="$(curl -s https://checkip.amazonaws.com | tr -d '\n')"
aws rds modify-db-instance --db-instance-identifier pattadar-prod-pg \
  --no-publicly-accessible --apply-immediately --query 'DBInstance.DBInstanceStatus' --output text
aws ec2 revoke-security-group-ingress --group-id sg-0b99e08ce9240e0c8 \
  --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=${MYIP}/32}]" || true
echo "closed."
