#!/bin/bash
set -euo pipefail
export MSYS_NO_PATHCONV=1

# ============================================================================
# deploy.sh — Full AWS deployment for shopsmarsales
#
# Provisions: VPC, RDS PostgreSQL, ECR, ECS Fargate, ALB, S3, CloudFront
# Builds and deploys both frontend and backend
#
# Prerequisites:
#   - AWS CLI v2 installed and configured (aws configure)
#   - Docker installed and running
#   - Node.js 18+ and npm installed
#   - jq installed (sudo apt install jq / brew install jq / choco install jq)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================================

# ─── Configuration ──────────────────────────────────────────────────────────

PROJECT="shopsmarsales"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

VPC_CIDR="10.0.0.0/16"
PUBLIC_SUBNET_1_CIDR="10.0.1.0/24"
PUBLIC_SUBNET_2_CIDR="10.0.2.0/24"
PRIVATE_SUBNET_1_CIDR="10.0.10.0/24"
PRIVATE_SUBNET_2_CIDR="10.0.11.0/24"

DB_NAME="shopsmarsales"
DB_USER="shopsmarsales_admin"
DB_INSTANCE_CLASS="db.t3.micro"
DB_ENGINE_VERSION="15"
DB_ALLOCATED_STORAGE=20

ECS_CPU="256"
ECS_MEMORY="512"
CONTAINER_PORT=4000

ECR_REPO="${PROJECT}-backend"
ECS_CLUSTER="${PROJECT}-cluster"
ECS_SERVICE="${PROJECT}-service"
ECS_TASK_FAMILY="${PROJECT}-task"
ALB_NAME="${PROJECT}-alb"
TG_NAME="${PROJECT}-tg"

S3_BUCKET="${PROJECT}-frontend-${AWS_ACCOUNT_ID}"
CF_COMMENT="shopsmarsales frontend"

STATE_FILE=".deploy-state.json"

# ─── Helpers ────────────────────────────────────────────────────────────────

log()  { echo -e "\n\033[1;34m==> $1\033[0m"; }
ok()   { echo -e "    \033[0;32m✓ $1\033[0m"; }
warn() { echo -e "    \033[0;33m⚠ $1\033[0m"; }
err()  { echo -e "    \033[0;31m✗ $1\033[0m"; exit 1; }

save_state() { echo "$1" > "$STATE_FILE"; }
load_state() { [ -f "$STATE_FILE" ] && cat "$STATE_FILE" || echo "{}"; }

jq_set() {
  local key="$1" val="$2"
  local state
  state=$(load_state)
  echo "$state" | jq --arg k "$key" --arg v "$val" '. + {($k): $v}' > "$STATE_FILE"
}

jq_get() {
  local key="$1"
  load_state | jq -r --arg k "$key" '.[$k] // empty'
}

check_prereqs() {
  log "Checking prerequisites..."
  command -v aws  >/dev/null 2>&1 || err "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
  command -v docker >/dev/null 2>&1 || err "Docker not found. Install: https://docs.docker.com/get-docker/"
  command -v node >/dev/null 2>&1 || err "Node.js not found. Install: https://nodejs.org/"
  command -v jq   >/dev/null 2>&1 || err "jq not found. Install: sudo apt install jq / brew install jq / choco install jq"
  ok "All prerequisites met"
  ok "AWS Account: $AWS_ACCOUNT_ID"
  ok "Region: $AWS_REGION"
}

get_azs() {
  aws ec2 describe-availability-zones \
    --region "$AWS_REGION" \
    --query "AvailabilityZones[?State==\`available\`].ZoneName" \
    --output text | tr '\t' '\n' | head -2
}

# ─── Step 1: VPC & Networking ──────────────────────────────────────────────

create_networking() {
  log "Step 1: Creating VPC and networking..."

  local vpc_id
  vpc_id=$(jq_get vpc_id)
  if [ -n "$vpc_id" ]; then
    ok "VPC already exists: $vpc_id"
  else
    vpc_id=$(aws ec2 create-vpc \
      --cidr-block "$VPC_CIDR" \
      --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${PROJECT}-vpc}]" \
      --query 'Vpc.VpcId' --output text)
    aws ec2 modify-vpc-attribute --vpc-id "$vpc_id" --enable-dns-support
    aws ec2 modify-vpc-attribute --vpc-id "$vpc_id" --enable-dns-hostnames
    jq_set vpc_id "$vpc_id"
    ok "VPC created: $vpc_id"
  fi

  local igw_id
  igw_id=$(jq_get igw_id)
  if [ -z "$igw_id" ]; then
    igw_id=$(aws ec2 create-internet-gateway \
      --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${PROJECT}-igw}]" \
      --query 'InternetGateway.InternetGatewayId' --output text)
    aws ec2 attach-internet-gateway --internet-gateway-id "$igw_id" --vpc-id "$vpc_id"
    jq_set igw_id "$igw_id"
    ok "Internet Gateway: $igw_id"
  else
    ok "Internet Gateway already exists: $igw_id"
  fi

  AZ1="${AWS_REGION}a"
  AZ2="${AWS_REGION}b"
  ok "Using AZs: $AZ1, $AZ2"

  local pub1 pub2 priv1 priv2
  pub1=$(jq_get pub_subnet_1)
  if [ -z "$pub1" ]; then
    pub1=$(aws ec2 create-subnet --vpc-id "$vpc_id" --cidr-block "$PUBLIC_SUBNET_1_CIDR" \
      --availability-zone "$AZ1" \
      --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-public-1}]" \
      --query 'Subnet.SubnetId' --output text)
    aws ec2 modify-subnet-attribute --subnet-id "$pub1" --map-public-ip-on-launch
    jq_set pub_subnet_1 "$pub1"
  fi
  pub2=$(jq_get pub_subnet_2)
  if [ -z "$pub2" ]; then
    pub2=$(aws ec2 create-subnet --vpc-id "$vpc_id" --cidr-block "$PUBLIC_SUBNET_2_CIDR" \
      --availability-zone "$AZ2" \
      --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-public-2}]" \
      --query 'Subnet.SubnetId' --output text)
    aws ec2 modify-subnet-attribute --subnet-id "$pub2" --map-public-ip-on-launch
    jq_set pub_subnet_2 "$pub2"
  fi
  priv1=$(jq_get priv_subnet_1)
  if [ -z "$priv1" ]; then
    priv1=$(aws ec2 create-subnet --vpc-id "$vpc_id" --cidr-block "$PRIVATE_SUBNET_1_CIDR" \
      --availability-zone "$AZ1" \
      --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-private-1}]" \
      --query 'Subnet.SubnetId' --output text)
    jq_set priv_subnet_1 "$priv1"
  fi
  priv2=$(jq_get priv_subnet_2)
  if [ -z "$priv2" ]; then
    priv2=$(aws ec2 create-subnet --vpc-id "$vpc_id" --cidr-block "$PRIVATE_SUBNET_2_CIDR" \
      --availability-zone "$AZ2" \
      --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PROJECT}-private-2}]" \
      --query 'Subnet.SubnetId' --output text)
    jq_set priv_subnet_2 "$priv2"
  fi
  ok "Subnets: public=[$pub1, $pub2], private=[$priv1, $priv2]"

  local rt_id
  rt_id=$(jq_get public_rt)
  if [ -z "$rt_id" ]; then
    rt_id=$(aws ec2 create-route-table --vpc-id "$vpc_id" \
      --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${PROJECT}-public-rt}]" \
      --query 'RouteTable.RouteTableId' --output text)
    aws ec2 create-route --route-table-id "$rt_id" --destination-cidr-block "0.0.0.0/0" \
      --gateway-id "$igw_id" > /dev/null
    aws ec2 associate-route-table --route-table-id "$rt_id" --subnet-id "$pub1" > /dev/null
    aws ec2 associate-route-table --route-table-id "$rt_id" --subnet-id "$pub2" > /dev/null
    jq_set public_rt "$rt_id"
  fi
  ok "Public route table: $rt_id"

  local alb_sg ecs_sg rds_sg
  alb_sg=$(jq_get alb_sg)
  if [ -z "$alb_sg" ]; then
    alb_sg=$(aws ec2 create-security-group --vpc-id "$vpc_id" \
      --group-name "${PROJECT}-alb-sg" --description "ALB SG" \
      --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id "$alb_sg" \
      --protocol tcp --port 80 --cidr "0.0.0.0/0" > /dev/null
    aws ec2 authorize-security-group-ingress --group-id "$alb_sg" \
      --protocol tcp --port 443 --cidr "0.0.0.0/0" > /dev/null
    jq_set alb_sg "$alb_sg"
  fi

  ecs_sg=$(jq_get ecs_sg)
  if [ -z "$ecs_sg" ]; then
    ecs_sg=$(aws ec2 create-security-group --vpc-id "$vpc_id" \
      --group-name "${PROJECT}-ecs-sg" --description "ECS SG" \
      --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id "$ecs_sg" \
      --protocol tcp --port "$CONTAINER_PORT" --source-group "$alb_sg" > /dev/null
    jq_set ecs_sg "$ecs_sg"
  fi

  rds_sg=$(jq_get rds_sg)
  if [ -z "$rds_sg" ]; then
    rds_sg=$(aws ec2 create-security-group --vpc-id "$vpc_id" \
      --group-name "${PROJECT}-rds-sg" --description "RDS SG" \
      --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id "$rds_sg" \
      --protocol tcp --port 5432 --source-group "$ecs_sg" > /dev/null
    jq_set rds_sg "$rds_sg"
  fi
  ok "Security Groups: ALB=$alb_sg, ECS=$ecs_sg, RDS=$rds_sg"
}

# ─── Step 2: RDS PostgreSQL ───────────────────────────────────────────────

create_rds() {
  log "Step 2: Creating RDS PostgreSQL..."

  local rds_endpoint
  rds_endpoint=$(jq_get rds_endpoint)
  if [ -n "$rds_endpoint" ]; then
    ok "RDS already exists: $rds_endpoint"
    return
  fi

  local db_password
  db_password=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)

  aws secretsmanager create-secret \
    --name "${PROJECT}/db-password" \
    --secret-string "$db_password" \
    --region "$AWS_REGION" > /dev/null 2>&1 || \
  aws secretsmanager put-secret-value \
    --secret-id "${PROJECT}/db-password" \
    --secret-string "$db_password" \
    --region "$AWS_REGION" > /dev/null

  ok "DB password stored in Secrets Manager (${PROJECT}/db-password)"

  local priv1 priv2 rds_sg
  priv1=$(jq_get priv_subnet_1)
  priv2=$(jq_get priv_subnet_2)
  rds_sg=$(jq_get rds_sg)

  aws rds create-db-subnet-group \
    --db-subnet-group-name "${PROJECT}-db-subnets" \
    --db-subnet-group-description "Private subnets for RDS" \
    --subnet-ids "$priv1" "$priv2" > /dev/null 2>&1 || true

  aws rds create-db-instance \
    --db-instance-identifier "${PROJECT}-db" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine postgres \
    --engine-version "$DB_ENGINE_VERSION" \
    --allocated-storage "$DB_ALLOCATED_STORAGE" \
    --master-username "$DB_USER" \
    --master-user-password "$db_password" \
    --db-name "$DB_NAME" \
    --vpc-security-group-ids "$rds_sg" \
    --db-subnet-group-name "${PROJECT}-db-subnets" \
    --backup-retention-period 7 \
    --no-publicly-accessible \
    --storage-encrypted \
    --no-multi-az > /dev/null

  echo "    Waiting for RDS to become available (this takes 5-10 minutes)..."
  aws rds wait db-instance-available --db-instance-identifier "${PROJECT}-db"

  rds_endpoint=$(aws rds describe-db-instances \
    --db-instance-identifier "${PROJECT}-db" \
    --query 'DBInstances[0].Endpoint.Address' --output text)
  jq_set rds_endpoint "$rds_endpoint"
  jq_set db_password "$db_password"

  local database_url="postgresql://${DB_USER}:${db_password}@${rds_endpoint}:5432/${DB_NAME}"
  jq_set database_url "$database_url"
  ok "RDS available: $rds_endpoint"
}

# ─── Step 3: ECR + Docker build ──────────────────────────────────────────

create_ecr_and_push() {
  log "Step 3: Building and pushing Docker image..."

  local ecr_pushed
  ecr_pushed=$(jq_get ecr_pushed)
  if [ "$ecr_pushed" = "true" ]; then
    ok "Docker image already pushed (skipping). Use redeploy.sh to update."
    return
  fi

  aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" > /dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" > /dev/null

  local ecr_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
  jq_set ecr_uri "$ecr_uri"

  aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  docker build --no-cache -t "${ECR_REPO}:latest" ./backend
  docker tag "${ECR_REPO}:latest" "${ecr_uri}:latest"
  docker push "${ecr_uri}:latest"
  jq_set ecr_pushed "true"
  ok "Image pushed: ${ecr_uri}:latest"
}

# ─── Step 4: ECS Fargate + ALB ──────────────────────────────────────────

create_ecs() {
  log "Step 4: Creating ECS Fargate service with ALB..."

  local vpc_id pub1 pub2 alb_sg ecs_sg ecr_uri database_url
  vpc_id=$(jq_get vpc_id)
  pub1=$(jq_get pub_subnet_1)
  pub2=$(jq_get pub_subnet_2)
  alb_sg=$(jq_get alb_sg)
  ecs_sg=$(jq_get ecs_sg)
  ecr_uri=$(jq_get ecr_uri)
  database_url=$(jq_get database_url)

  aws ecs create-cluster --cluster-name "$ECS_CLUSTER" --region "$AWS_REGION" > /dev/null 2>&1 || true
  ok "ECS cluster: $ECS_CLUSTER"

  local execution_role_arn
  execution_role_arn=$(aws iam get-role --role-name ecsTaskExecutionRole \
    --query 'Role.Arn' --output text 2>/dev/null || true)

  if [ -z "$execution_role_arn" ] || [ "$execution_role_arn" = "None" ]; then
    aws iam create-role --role-name ecsTaskExecutionRole \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]
      }' > /dev/null
    aws iam attach-role-policy --role-name ecsTaskExecutionRole \
      --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    execution_role_arn=$(aws iam get-role --role-name ecsTaskExecutionRole --query 'Role.Arn' --output text)
  fi

  local log_group="/ecs/${PROJECT}"
  aws logs create-log-group --log-group-name "$log_group" --region "$AWS_REGION" 2>/dev/null || true

  cat > task-def.json <<TASKEOF
{
  "family": "${ECS_TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${ECS_CPU}",
  "memory": "${ECS_MEMORY}",
  "executionRoleArn": "${execution_role_arn}",
  "containerDefinitions": [
    {
      "name": "${PROJECT}-api",
      "image": "${ecr_uri}:latest",
      "essential": true,
      "portMappings": [{"containerPort": ${CONTAINER_PORT}, "protocol": "tcp"}],
      "environment": [
        {"name": "DATABASE_URL", "value": "${database_url}"},
        {"name": "PORT", "value": "${CONTAINER_PORT}"},
        {"name": "FRONTEND_URL", "value": "*"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${log_group}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
TASKEOF

  aws ecs register-task-definition --cli-input-json file://task-def.json > /dev/null
  ok "Task definition registered: $ECS_TASK_FAMILY"

  local alb_arn
  alb_arn=$(jq_get alb_arn)
  if [ -z "$alb_arn" ]; then
    alb_arn=$(aws elbv2 create-load-balancer \
      --name "$ALB_NAME" \
      --subnets "$pub1" "$pub2" \
      --security-groups "$alb_sg" \
      --scheme internet-facing \
      --type application \
      --query 'LoadBalancers[0].LoadBalancerArn' --output text)
    jq_set alb_arn "$alb_arn"
  fi

  local alb_dns
  alb_dns=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns "$alb_arn" \
    --query 'LoadBalancers[0].DNSName' --output text)
  jq_set alb_dns "$alb_dns"
  ok "ALB: $alb_dns"

  local tg_arn
  tg_arn=$(jq_get tg_arn)
  if [ -z "$tg_arn" ]; then
    tg_arn=$(aws elbv2 create-target-group \
      --name "$TG_NAME" \
      --protocol HTTP --port "$CONTAINER_PORT" \
      --vpc-id "$vpc_id" \
      --target-type ip \
      --health-check-path "/api/sales" \
      --health-check-interval-seconds 30 \
      --healthy-threshold-count 2 \
      --query 'TargetGroups[0].TargetGroupArn' --output text)
    jq_set tg_arn "$tg_arn"
  fi

  aws elbv2 create-listener \
    --load-balancer-arn "$alb_arn" \
    --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$tg_arn" > /dev/null 2>&1 || true

  local service_exists
  service_exists=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" \
    --query 'services[?status==`ACTIVE`].serviceName' --output text 2>/dev/null || true)

  if [ -z "$service_exists" ]; then
    aws ecs create-service \
      --cluster "$ECS_CLUSTER" \
      --service-name "$ECS_SERVICE" \
      --task-definition "$ECS_TASK_FAMILY" \
      --desired-count 1 \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[$pub1,$pub2],securityGroups=[$ecs_sg],assignPublicIp=ENABLED}" \
      --load-balancers "targetGroupArn=$tg_arn,containerName=${PROJECT}-api,containerPort=$CONTAINER_PORT" > /dev/null
    ok "ECS service created: $ECS_SERVICE"
  else
    aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" \
      --task-definition "$ECS_TASK_FAMILY" --force-new-deployment > /dev/null
    ok "ECS service updated: $ECS_SERVICE"
  fi

  echo "    Waiting for service to stabilize..."
  aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" 2>/dev/null || \
    warn "Service may still be starting — check AWS console if needed"
}

# ─── Step 5: Frontend → S3 ───────────────────────────────────────────────

deploy_frontend() {
  log "Step 5: Building and deploying frontend to S3..."

  local frontend_deployed
  frontend_deployed=$(jq_get frontend_deployed)
  if [ "$frontend_deployed" = "true" ]; then
    ok "Frontend already deployed (skipping). Use redeploy.sh to update."
    return
  fi

  local alb_dns
  alb_dns=$(jq_get alb_dns)

  cd frontend
  REACT_APP_API_URL="http://${alb_dns}" npm run build
  cd ..

  aws s3 mb "s3://${S3_BUCKET}" --region "$AWS_REGION" 2>/dev/null || true

  aws s3api put-public-access-block --bucket "$S3_BUCKET" \
    --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

  aws s3 sync frontend/build/ "s3://${S3_BUCKET}/" --delete

  cat > s3-policy.json <<POLICYEOF
{
  "Version":"2012-10-17",
  "Statement":[{
    "Sid":"PublicRead",
    "Effect":"Allow",
    "Principal":"*",
    "Action":"s3:GetObject",
    "Resource":"arn:aws:s3:::${S3_BUCKET}/*"
  }]
}
POLICYEOF
  aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy file://s3-policy.json

  aws s3 website "s3://${S3_BUCKET}" --index-document index.html --error-document index.html

  jq_set s3_bucket "$S3_BUCKET"
  jq_set frontend_deployed "true"
  ok "Frontend deployed to: http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
}

# ─── Step 6: CloudFront ──────────────────────────────────────────────────

create_cloudfront() {
  log "Step 6: Creating CloudFront distribution..."

  local cf_id
  cf_id=$(jq_get cf_distribution_id)
  if [ -n "$cf_id" ]; then
    ok "CloudFront already exists: $cf_id"
    return
  fi

  local caller_ref
  caller_ref="deploy-$(date +%s)"

  local origin_domain="${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"

  cat > cf-config.json <<CFEOF
{
  "CallerReference": "${caller_ref}",
  "Comment": "${CF_COMMENT}",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-${S3_BUCKET}",
      "DomainName": "${origin_domain}",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only"
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${S3_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity":2,
      "Items":["GET","HEAD"],
      "CachedMethods": {"Quantity":2,"Items":["GET","HEAD"]}
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward":"none"}
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 404,
      "ResponseCode": "200",
      "ResponsePagePath": "/index.html",
      "ErrorCachingMinTTL": 0
    }]
  },
  "PriceClass": "PriceClass_100"
}
CFEOF

  local cf_domain
  cf_id=$(aws cloudfront create-distribution \
    --distribution-config file://cf-config.json \
    --query 'Distribution.Id' --output text)
  cf_domain=$(aws cloudfront get-distribution --id "$cf_id" \
    --query 'Distribution.DomainName' --output text)

  jq_set cf_distribution_id "$cf_id"
  jq_set cf_domain "$cf_domain"
  ok "CloudFront distribution created: https://${cf_domain}"
  warn "It may take 5-15 minutes to fully deploy"
}

# ─── Step 7: Prisma Migrations ──────────────────────────────────────────

run_migrations() {
  log "Step 7: Prisma migrations..."
  ok "Migrations run automatically inside the ECS container on startup"
  ok "The Docker entrypoint runs 'prisma migrate deploy' before starting the server"
}

# ─── Summary ────────────────────────────────────────────────────────────

print_summary() {
  local alb_dns cf_domain rds_endpoint
  alb_dns=$(jq_get alb_dns)
  cf_domain=$(jq_get cf_domain)
  rds_endpoint=$(jq_get rds_endpoint)

  echo ""
  echo "============================================"
  echo "  Deployment Complete!"
  echo "============================================"
  echo "  Frontend URL:  https://${cf_domain}"
  echo "  Backend URL:   http://${alb_dns}"
  echo "  RDS Endpoint:  ${rds_endpoint}"
  echo "  DB Password:   Stored in Secrets Manager (${PROJECT}/db-password)"
  echo "  S3 Bucket:     ${S3_BUCKET}"
  echo "  ECS Cluster:   ${ECS_CLUSTER}"
  echo "  State file:    ${STATE_FILE}"
  echo "============================================"
  echo ""
  echo "  Next steps:"
  echo "    - Test: curl http://${alb_dns}/api/sales"
  echo "    - Sync data: export CLOUD_DATABASE_URL='postgresql://${DB_USER}:<password>@${rds_endpoint}:5432/${DB_NAME}'"
  echo "    - Redeploy: ./redeploy.sh"
  echo "    - Teardown:  ./teardown.sh"
  echo "============================================"
}

# ─── Main ───────────────────────────────────────────────────────────────

show_help() {
  echo "Usage: ./deploy.sh [--from-step N]"
  echo ""
  echo "Steps:"
  echo "  1  VPC & Networking"
  echo "  2  RDS PostgreSQL"
  echo "  3  ECR + Docker build & push"
  echo "  4  ECS Fargate + ALB"
  echo "  5  Frontend -> S3"
  echo "  6  CloudFront"
  echo "  7  Prisma Migrations"
  echo ""
  echo "Example: ./deploy.sh --from-step 5"
}

main() {
  local start_step=1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from-step) start_step="$2"; shift 2 ;;
      --help|-h)   show_help; exit 0 ;;
      *)           echo "Unknown arg: $1"; show_help; exit 1 ;;
    esac
  done

  echo "============================================"
  echo "  shopsmarsales — AWS Deployment"
  echo "============================================"
  check_prereqs

  [ "$start_step" -le 1 ] && create_networking
  [ "$start_step" -le 2 ] && create_rds
  [ "$start_step" -le 3 ] && create_ecr_and_push
  [ "$start_step" -le 4 ] && create_ecs
  [ "$start_step" -le 5 ] && deploy_frontend
  [ "$start_step" -le 6 ] && create_cloudfront
  [ "$start_step" -le 7 ] && run_migrations
  print_summary
}

main "$@"
