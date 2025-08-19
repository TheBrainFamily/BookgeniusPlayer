#!/usr/bin/env bash
set -euo pipefail

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

# === Service events: first 2 and last 2 (if jq available), otherwise first 8 ===
echo "=== Recent service events (first 2 & last 2) ==="
DESCRIBE_JSON=$(aws ecs describe-services \
  --cluster "$CLUSTER_NAME" \
  --services "$SERVICE_ARN" \
  --region "$REGION" \
  --query "services[0].events" \
  --output json)

if command -v jq >/dev/null 2>&1; then
  echo "$DESCRIBE_JSON" | jq -r '
    if length == 0 then
      "No events"
    else
      . as $e
      | ($e | .[:2]) as $first
      | ($e | if length>2 then .[-2:] else [] end) as $last
      | ("-- FIRST 2 --"), ($first[] | "\(.createdAt)  \(.message)"), 
        "\n-- LAST 2 --",
        ($last[] | "\(.createdAt)  \(.message)")
    end
  '
else
  echo "jq not found — showing first 8 events instead (install jq for precise first/last slices)."
  aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_ARN" \
    --region "$REGION" \
    --query "services[0].events[:8].[createdAt,message]" \
    --output table
fi
echo

# === STOPPED tasks: pick first 2 and last 2 ARNs from the STOPPED list ===
echo "=== Finding STOPPED tasks for the service ==="
# Get all stopped task ARNs (space-separated)
ALL_STOPPED_ARNS_TEXT=$(
  aws ecs list-tasks \
    --cluster "$CLUSTER_NAME" \
    --service-name "$SERVICE_ARN" \
    --desired-status STOPPED \
    --region "$REGION" \
    --output text \
    --query 'taskArns'
)

# Build bash array from whitespace-separated output
read -r -a TASK_ARY <<<"$ALL_STOPPED_ARNS_TEXT"
NUM_TASKS=${#TASK_ARY[@]}

if [ "$NUM_TASKS" -eq 0 ]; then
  echo "No STOPPED tasks found for service $SERVICE_ARN"
else
  echo "Found $NUM_TASKS STOPPED task(s). Showing up to first 2 and last 2."
  # pick first 2
  FIRST_COUNT=2
  LAST_COUNT=2

  # compute start for last slice
  if [ "$NUM_TASKS" -le $FIRST_COUNT ]; then
    SELECTED=("${TASK_ARY[@]}")
  else
    START_LAST=$(( NUM_TASKS - LAST_COUNT ))
    # Build list: first 2, then last 2 (avoid duplicates)
    SELECTED=()
    for i in $(seq 0 $(( FIRST_COUNT - 1 ))); do
      [ "$i" -lt "$NUM_TASKS" ] && SELECTED+=("${TASK_ARY[i]}")
    done
    for i in $(seq "$START_LAST" $(( NUM_TASKS - 1 ))); do
      # avoid duplicating if arrays overlap
      already=false
      for v in "${SELECTED[@]}"; do [ "$v" = "${TASK_ARY[i]}" ] && already=true && break; done
      $already || SELECTED+=("${TASK_ARY[i]}")
    done
  fi

  # print summary of selected ARNs
  echo "Selected task ARNs (first/last):"
  for t in "${SELECTED[@]}"; do
    echo " - $t"
  done
  echo

  # Describe each selected task with useful fields
  for TASK in "${SELECTED[@]}"; do
    echo "=== describe-tasks for $TASK ==="
    aws ecs describe-tasks \
      --cluster "$CLUSTER_NAME" \
      --tasks "$TASK" \
      --region "$REGION" \
      --query 'tasks[0].[taskArn,startedAt,stoppedAt,stoppedReason,containers[].name,containers[].exitCode,containers[].reason,containers[].lastStatus]' \
      --output table
    echo
  done
fi

# === Checking Target Group health from CloudFormation ===
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
    --query "TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}" \
    --output table
fi

echo
echo "done."
