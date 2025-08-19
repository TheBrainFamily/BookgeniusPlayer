#!/usr/bin/env bash
set -euo pipefail

# override these if you want: STACK_NAME=MyStack REGION=eu-central-1 ./ecs-debug.sh
STACK_NAME="${STACK_NAME:-AnswerServerStack}"
REGION="${REGION:-eu-central-1}"

echo "Using STACK_NAME=$STACK_NAME REGION=$REGION"
echo

# A) get cluster physical id
export CLUSTER_NAME=$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::ECS::Cluster'].PhysicalResourceId" \
    --output text
)

if [ -z "$CLUSTER_NAME" ] || [ "$CLUSTER_NAME" = "None" ]; then
  echo "ERROR: could not find ECS Cluster for CloudFormation stack $STACK_NAME" >&2
  exit 2
fi
echo "CLUSTER_NAME=$CLUSTER_NAME"
echo

# B) list services and export first service ARN
export SERVICE_ARN=$(
  aws ecs list-services \
    --cluster "$CLUSTER_NAME" \
    --region "$REGION" \
    --query 'serviceArns[0]' \
    --output text
)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" = "None" ]; then
  echo "ERROR: no service ARNs found in cluster $CLUSTER_NAME" >&2
  exit 3
fi
echo "SERVICE_ARN=$SERVICE_ARN"
echo

# 1) show recent service events (first 6)
echo "=== Recent service events ==="
aws ecs describe-services \
  --cluster "$CLUSTER_NAME" \
  --services "$SERVICE_ARN" \
  --region "$REGION" \
  --query "services[0].events[:6].[createdAt,message]" \
  --output table
echo

# 2) Get most recent STOPPED task ARN for that service (smoking gun)
echo "=== Finding most recent STOPPED task ==="
TASK=$(
  aws ecs list-tasks \
    --cluster "$CLUSTER_NAME" \
    --service-name "$SERVICE_ARN" \
    --desired-status STOPPED \
    --region "$REGION" \
    --query 'taskArns[0]' \
    --output text
)

if [ -z "$TASK" ] || [ "$TASK" = "None" ]; then
  echo "No STOPPED tasks found for service $SERVICE_ARN" >&2
else
  echo "Most recent STOPPED TASK ARN: $TASK"
  aws ecs describe-tasks \
    --cluster "$CLUSTER_NAME" \
    --tasks "$TASK" \
    --region "$REGION" \
    --query "tasks[0].[stoppedReason,containers[0].exitCode,containers[0].reason]" \
    --output table
fi
echo

# 3) Target group health (if load-balanced)
echo "=== Checking Target Group health from CloudFormation ==="
TG=$(
  aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::ElasticLoadBalancingV2::TargetGroup'].PhysicalResourceId" \
    --output text
)

if [ -z "$TG" ] || [ "$TG" = "None" ]; then
  echo "No ALB/NLB TargetGroup found in CloudFormation for stack $STACK_NAME"
else
  echo "TargetGroup ARN: $TG"
  aws elbv2 describe-target-health \
    --target-group-arn "$TG" \
    --region "$REGION" \
    --query "TargetHealthDescriptions[].TargetHealth" \
    --output table
fi

echo
echo "done."
