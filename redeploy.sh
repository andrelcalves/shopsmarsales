#!/bin/bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# ============================================================================
# redeploy.sh — Lightweight re-deployment (code changes only, no infra)
#
# Rebuilds Docker image, pushes to ECR, forces ECS re-deploy,
# rebuilds frontend, syncs to S3, invalidates CloudFront cache.
#
# Usage:
#   chmod +x redeploy.sh
#   ./redeploy.sh
# ============================================================================

PROJECT="shopsmarsales"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STATE_FILE=".deploy-state.json"

ECR_REPO="${PROJECT}-backend"
ECS_CLUSTER="${PROJECT}-cluster"
ECS_SERVICE="${PROJECT}-service"
ECS_TASK_FAMILY="${PROJECT}-task"

log()  { echo -e "\n\033[1;34m==> $1\033[0m"; }
ok()   { echo -e "    \033[0;32m✓ $1\033[0m"; }
warn() { echo -e "    \033[0;33m⚠ $1\033[0m"; }
err()  { echo -e "    \033[0;31m✗ $1\033[0m"; exit 1; }

jq_get() { cat "$STATE_FILE" | jq -r --arg k "$1" '.[$k] // empty'; }

[ -f "$STATE_FILE" ] || err "State file not found. Run deploy.sh first."

echo "============================================"
echo "  shopsmarsales — Re-deploy"
echo "============================================"

# ─── Step 1: Rebuild & push backend Docker image ─────────────────────────

log "Step 1: Building and pushing backend Docker image..."
ecr_uri=$(jq_get ecr_uri)

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker build -t "${ECR_REPO}:latest" ./backend
docker tag "${ECR_REPO}:latest" "${ecr_uri}:latest"
docker push "${ecr_uri}:latest"
ok "Image pushed: ${ecr_uri}:latest"

# ─── Step 2: Force new ECS deployment ────────────────────────────────────

log "Step 2: Forcing new ECS deployment..."
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$ECS_TASK_FAMILY" \
  --force-new-deployment > /dev/null
ok "ECS service redeployment triggered"

# ─── Step 3: Run Prisma migrations ──────────────────────────────────────

log "Step 3: Running Prisma migrations..."
database_url=$(jq_get database_url)
rds_sg=$(jq_get rds_sg)
my_ip=$(curl -s https://checkip.amazonaws.com)

aws ec2 authorize-security-group-ingress --group-id "$rds_sg" \
  --protocol tcp --port 5432 --cidr "${my_ip}/32" > /dev/null 2>&1 || true

cd backend
DATABASE_URL="$database_url" npx prisma migrate deploy 2>&1 || \
  warn "No pending migrations or RDS not reachable from this network"
cd ..

aws ec2 revoke-security-group-ingress --group-id "$rds_sg" \
  --protocol tcp --port 5432 --cidr "${my_ip}/32" > /dev/null 2>&1 || true

ok "Migrations applied"

# ─── Step 4: Rebuild & deploy frontend ───────────────────────────────────

log "Step 4: Building and deploying frontend..."
alb_dns=$(jq_get alb_dns)
s3_bucket=$(jq_get s3_bucket)

cd frontend
REACT_APP_API_URL="http://${alb_dns}" npm run build
cd ..

aws s3 sync frontend/build/ "s3://${s3_bucket}/" --delete
ok "Frontend synced to S3"

# ─── Step 5: Invalidate CloudFront cache ─────────────────────────────────

log "Step 5: Invalidating CloudFront cache..."
cf_id=$(jq_get cf_distribution_id)
if [ -n "$cf_id" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$cf_id" \
    --paths "/*" > /dev/null
  ok "CloudFront cache invalidated"
else
  warn "No CloudFront distribution found — skipping"
fi

echo ""
echo "============================================"
echo "  Re-deploy complete!"
echo "============================================"
echo "  Backend:  http://${alb_dns}"
echo "  Frontend: https://$(jq_get cf_domain)"
echo "============================================"
