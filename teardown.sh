#!/bin/bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# ============================================================================
# teardown.sh — Destroy all AWS resources created by deploy.sh
#
# Deletes: CloudFront, S3, ECS, ALB, ECR, RDS, security groups, subnets, VPC
# Requires confirmation before proceeding.
#
# Usage:
#   chmod +x teardown.sh
#   ./teardown.sh
# ============================================================================

PROJECT="shopsmarsales"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STATE_FILE=".deploy-state.json"

ECR_REPO="${PROJECT}-backend"
ECS_CLUSTER="${PROJECT}-cluster"
ECS_SERVICE="${PROJECT}-service"
ALB_NAME="${PROJECT}-alb"
TG_NAME="${PROJECT}-tg"

log()  { echo -e "\n\033[1;34m==> $1\033[0m"; }
ok()   { echo -e "    \033[0;32m✓ $1\033[0m"; }
warn() { echo -e "    \033[0;33m⚠ $1\033[0m"; }

jq_get() { cat "$STATE_FILE" 2>/dev/null | jq -r --arg k "$1" '.[$k] // empty'; }

echo "============================================"
echo "  shopsmarsales — TEARDOWN"
echo "============================================"
echo ""
echo "  WARNING: This will PERMANENTLY DELETE all"
echo "  AWS resources for this project including"
echo "  the database and all its data."
echo ""
read -r -p "  Type 'DELETE' to confirm: " confirm
if [ "$confirm" != "DELETE" ]; then
  echo "  Aborted."
  exit 0
fi
echo ""

# ─── CloudFront ──────────────────────────────────────────────────────────

log "Disabling and deleting CloudFront distribution..."
cf_id=$(jq_get cf_distribution_id)
if [ -n "$cf_id" ]; then
  local_etag=$(aws cloudfront get-distribution-config --id "$cf_id" --query 'ETag' --output text 2>/dev/null || true)
  if [ -n "$local_etag" ] && [ "$local_etag" != "None" ]; then
    cf_config=$(aws cloudfront get-distribution-config --id "$cf_id" --output json)
    disabled_config=$(echo "$cf_config" | jq '.DistributionConfig.Enabled = false | .DistributionConfig')
    aws cloudfront update-distribution --id "$cf_id" --if-match "$local_etag" \
      --distribution-config "$disabled_config" > /dev/null 2>&1 || true
    echo "    Waiting for CloudFront to disable (this can take several minutes)..."
    aws cloudfront wait distribution-deployed --id "$cf_id" 2>/dev/null || true
    new_etag=$(aws cloudfront get-distribution-config --id "$cf_id" --query 'ETag' --output text)
    aws cloudfront delete-distribution --id "$cf_id" --if-match "$new_etag" > /dev/null 2>&1 || \
      warn "Could not delete CloudFront — may need manual deletion"
    ok "CloudFront disabled/deleted: $cf_id"
  fi
else
  ok "No CloudFront distribution found"
fi

# ─── S3 ─────────────────────────────────────────────────────────────────

log "Deleting S3 bucket..."
s3_bucket=$(jq_get s3_bucket)
if [ -n "$s3_bucket" ]; then
  aws s3 rb "s3://${s3_bucket}" --force 2>/dev/null || true
  ok "S3 bucket deleted: $s3_bucket"
else
  ok "No S3 bucket found"
fi

# ─── ECS ─────────────────────────────────────────────────────────────────

log "Deleting ECS service and cluster..."
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --desired-count 0 > /dev/null 2>&1 || true
aws ecs delete-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
  --force > /dev/null 2>&1 || true
ok "ECS service deleted"

sleep 5
aws ecs delete-cluster --cluster "$ECS_CLUSTER" > /dev/null 2>&1 || true
ok "ECS cluster deleted"

# ─── ALB & Target Group ─────────────────────────────────────────────────

log "Deleting ALB and target group..."
alb_arn=$(jq_get alb_arn)
tg_arn=$(jq_get tg_arn)

if [ -n "$alb_arn" ]; then
  listener_arns=$(aws elbv2 describe-listeners --load-balancer-arn "$alb_arn" \
    --query 'Listeners[].ListenerArn' --output text 2>/dev/null || true)
  for arn in $listener_arns; do
    aws elbv2 delete-listener --listener-arn "$arn" > /dev/null 2>&1 || true
  done
  aws elbv2 delete-load-balancer --load-balancer-arn "$alb_arn" > /dev/null 2>&1 || true
  ok "ALB deleted"
fi

if [ -n "$tg_arn" ]; then
  aws elbv2 delete-target-group --target-group-arn "$tg_arn" > /dev/null 2>&1 || true
  ok "Target group deleted"
fi

# ─── ECR ─────────────────────────────────────────────────────────────────

log "Deleting ECR repository..."
aws ecr delete-repository --repository-name "$ECR_REPO" --force --region "$AWS_REGION" > /dev/null 2>&1 || true
ok "ECR repository deleted"

# ─── RDS ─────────────────────────────────────────────────────────────────

log "Deleting RDS instance (skipping final snapshot)..."
aws rds delete-db-instance \
  --db-instance-identifier "${PROJECT}-db" \
  --skip-final-snapshot > /dev/null 2>&1 || true
echo "    Waiting for RDS deletion (this takes several minutes)..."
aws rds wait db-instance-deleted --db-instance-identifier "${PROJECT}-db" 2>/dev/null || true
aws rds delete-db-subnet-group --db-subnet-group-name "${PROJECT}-db-subnets" > /dev/null 2>&1 || true
ok "RDS instance deleted"

# ─── Secrets Manager ────────────────────────────────────────────────────

log "Deleting secrets..."
aws secretsmanager delete-secret --secret-id "${PROJECT}/db-password" \
  --force-delete-without-recovery --region "$AWS_REGION" > /dev/null 2>&1 || true
ok "Secret deleted"

# ─── CloudWatch Logs ────────────────────────────────────────────────────

log "Deleting log groups..."
aws logs delete-log-group --log-group-name "/ecs/${PROJECT}" --region "$AWS_REGION" > /dev/null 2>&1 || true
ok "Log group deleted"

# ─── Security Groups ────────────────────────────────────────────────────

log "Deleting security groups..."
sleep 10  # wait for ENIs to be released

alb_sg=$(jq_get alb_sg)
ecs_sg=$(jq_get ecs_sg)
rds_sg=$(jq_get rds_sg)

for sg in "$rds_sg" "$ecs_sg" "$alb_sg"; do
  if [ -n "$sg" ]; then
    aws ec2 delete-security-group --group-id "$sg" 2>/dev/null || \
      warn "Could not delete SG $sg — may need to wait for ENI release"
  fi
done
ok "Security groups deleted (or pending ENI release)"

# ─── Subnets, Route Tables, IGW, VPC ────────────────────────────────────

log "Deleting VPC resources..."
vpc_id=$(jq_get vpc_id)
igw_id=$(jq_get igw_id)
public_rt=$(jq_get public_rt)

if [ -n "$public_rt" ]; then
  assoc_ids=$(aws ec2 describe-route-tables --route-table-ids "$public_rt" \
    --query 'RouteTables[0].Associations[?!Main].RouteTableAssociationId' --output text 2>/dev/null || true)
  for aid in $assoc_ids; do
    aws ec2 disassociate-route-table --association-id "$aid" 2>/dev/null || true
  done
  aws ec2 delete-route-table --route-table-id "$public_rt" 2>/dev/null || true
fi

for subnet_key in pub_subnet_1 pub_subnet_2 priv_subnet_1 priv_subnet_2; do
  sid=$(jq_get "$subnet_key")
  [ -n "$sid" ] && aws ec2 delete-subnet --subnet-id "$sid" 2>/dev/null || true
done

if [ -n "$igw_id" ] && [ -n "$vpc_id" ]; then
  aws ec2 detach-internet-gateway --internet-gateway-id "$igw_id" --vpc-id "$vpc_id" 2>/dev/null || true
  aws ec2 delete-internet-gateway --internet-gateway-id "$igw_id" 2>/dev/null || true
fi

if [ -n "$vpc_id" ]; then
  aws ec2 delete-vpc --vpc-id "$vpc_id" 2>/dev/null || true
fi
ok "VPC and networking deleted"

# ─── Clean state file ───────────────────────────────────────────────────

log "Cleaning up state file..."
rm -f "$STATE_FILE"
ok "State file removed"

echo ""
echo "============================================"
echo "  Teardown complete!"
echo "============================================"
echo "  All resources have been deleted (or are"
echo "  pending deletion for async resources like"
echo "  CloudFront and RDS)."
echo "============================================"
