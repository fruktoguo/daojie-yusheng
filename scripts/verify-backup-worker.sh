#!/usr/bin/env bash
set -euo pipefail

DOCKER_CONTEXT="${DOCKER_CONTEXT:-production}"
STACK_NAME="${STACK_NAME:-daojie-yusheng}"
SERVER_SERVICE_NAME="${SERVER_SERVICE_NAME:-${STACK_NAME}_server}"
SERVICE_NAME="${SERVICE_NAME:-${STACK_NAME}_backup-worker}"
VOLUME_NAME="${VOLUME_NAME:-${STACK_NAME}_server_backup_data}"
HELPER_IMAGE="${BACKUP_WORKER_VERIFY_HELPER_IMAGE:-}"
SERVICE_TIMEOUT_SEC="${BACKUP_WORKER_SERVICE_TIMEOUT_SEC:-180}"
HEARTBEAT_TIMEOUT_SEC="${BACKUP_WORKER_HEARTBEAT_TIMEOUT_SEC:-180}"
HEARTBEAT_MAX_AGE_MS="${BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS:-60000}"
VERIFY_SERVICE_LOG_TIMEOUT_SEC="${BACKUP_WORKER_VERIFY_SERVICE_LOG_TIMEOUT_SEC:-20}"
VERIFY_SERVICE_NAME="${STACK_NAME}-backup-worker-verify-${RANDOM:-0}-$$"
VERIFY_SERVICE_LAST_STATE=''
VERIFY_SERVICE_LAST_LOGS=''

log() {
  printf '[verify-backup-worker] %s\n' "$*"
}

cleanup() {
  docker --context "$DOCKER_CONTEXT" service rm "$VERIFY_SERVICE_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

show_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$SERVICE_NAME" --no-trunc || true
}

show_service_logs() {
  docker --context "$DOCKER_CONTEXT" service logs --tail 200 "$SERVICE_NAME" || true
}

show_server_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$SERVER_SERVICE_NAME" --no-trunc || true
}

show_verify_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$VERIFY_SERVICE_NAME" --no-trunc || true
}

is_valid_heartbeat_json() {
  local raw="$1"
  if [[ -z "$raw" ]]; then
    return 1
  fi
  HEARTBEAT_JSON="$raw" node <<'NODE' >/dev/null 2>&1
const raw = process.env.HEARTBEAT_JSON ?? '';
try {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    process.exit(1);
  }
  if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt) {
    process.exit(1);
  }
  process.exit(0);
} catch {
  process.exit(1);
}
NODE
}

get_current_service_task_field() {
  local target_service="$1"
  local field_index="$2"
  docker --context "$DOCKER_CONTEXT" service ps "$target_service" --no-trunc --format '{{.Name}}|{{.CurrentState}}|{{.DesiredState}}|{{.Node}}' \
    | awk -F'|' -v field_index="$field_index" '$1 !~ /^\\_/ { print $field_index; exit }'
}

get_current_service_task_state() {
  get_current_service_task_field "$1" 2
}

get_current_service_task_node() {
  get_current_service_task_field "$1" 4
}

get_running_service_task_field() {
  local target_service="$1"
  local field_index="$2"
  docker --context "$DOCKER_CONTEXT" service ps "$target_service" --no-trunc --format '{{.Name}}|{{.CurrentState}}|{{.DesiredState}}|{{.Node}}' \
    | awk -F'|' -v field_index="$field_index" '$2 ~ /^Running / { print $field_index; exit }'
}

get_running_service_task_node() {
  get_running_service_task_field "$1" 4
}

get_preferred_running_service_task_node() {
  local target_service="$1"
  local current_state
  current_state="$(get_current_service_task_state "$target_service" || true)"
  if [[ "$current_state" == Running* ]]; then
    get_current_service_task_node "$target_service"
    return 0
  fi
  get_running_service_task_node "$target_service"
}

resolve_helper_image() {
  if [[ -n "$HELPER_IMAGE" ]]; then
    printf '%s\n' "$HELPER_IMAGE"
    return 0
  fi

  docker --context "$DOCKER_CONTEXT" service inspect "$SERVICE_NAME" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
}

start_verify_service() {
  local target_node="$1"
  local helper_image="$2"
  docker --context "$DOCKER_CONTEXT" service create \
    --quiet \
    --name "$VERIFY_SERVICE_NAME" \
    --restart-condition none \
    --constraint "node.hostname==${target_node}" \
    --mount "type=volume,source=${VOLUME_NAME},target=/backup" \
    --env "HEARTBEAT_MAX_AGE_MS=${HEARTBEAT_MAX_AGE_MS}" \
    "$helper_image" \
    sh -lc '
      set -eu
      file=/backup/_meta/worker-heartbeat.json
      if [ ! -s "$file" ]; then
        echo "missing-heartbeat-file" >&2
        exit 2
      fi
      mtime="$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")"
      now="$(date +%s)"
      age_ms=$(( (now - mtime) * 1000 ))
      if [ "$age_ms" -gt "${HEARTBEAT_MAX_AGE_MS:-60000}" ]; then
        echo "stale-heartbeat-file:${age_ms}ms" >&2
        exit 3
      fi
      cat "$file"
    ' \
    >/dev/null
}

probe_heartbeat_from_server_node_volume() {
  local target_node="$1"
  local max_wait_sec="${2:-$VERIFY_SERVICE_LOG_TIMEOUT_SEC}"
  local helper_image
  helper_image="$(resolve_helper_image)"

  VERIFY_SERVICE_LAST_STATE=''
  VERIFY_SERVICE_LAST_LOGS=''
  cleanup
  start_verify_service "$target_node" "$helper_image"
  local deadline=$((SECONDS + max_wait_sec))
  while (( SECONDS < deadline )); do
    local logs
    logs="$(docker --context "$DOCKER_CONTEXT" service logs --raw --no-task-ids "$VERIFY_SERVICE_NAME" 2>/dev/null || true)"
    if is_valid_heartbeat_json "$logs"; then
      VERIFY_SERVICE_LAST_STATE="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
      VERIFY_SERVICE_LAST_LOGS="$logs"
      return 0
    fi

    local state
    state="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
    if [[ "$state" == Complete* ]]; then
      VERIFY_SERVICE_LAST_STATE="$state"
      VERIFY_SERVICE_LAST_LOGS="$logs"
      if is_valid_heartbeat_json "$VERIFY_SERVICE_LAST_LOGS"; then
        return 0
      fi
    fi
    if [[ "$state" == Failed* || "$state" == Rejected* || "$state" == Shutdown* ]]; then
      break
    fi
    sleep 2
  done
  VERIFY_SERVICE_LAST_STATE="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
  VERIFY_SERVICE_LAST_LOGS="$(docker --context "$DOCKER_CONTEXT" service logs --raw --no-task-ids "$VERIFY_SERVICE_NAME" 2>/dev/null || true)"
  if is_valid_heartbeat_json "$VERIFY_SERVICE_LAST_LOGS"; then
    return 0
  fi
  return 1
}

log "检查游戏服服务 ${SERVER_SERVICE_NAME}"
docker --context "$DOCKER_CONTEXT" service inspect "$SERVER_SERVICE_NAME" >/dev/null

log "检查 backup worker 服务 ${SERVICE_NAME}"
docker --context "$DOCKER_CONTEXT" service inspect "$SERVICE_NAME" >/dev/null

log "检查备份卷 ${VOLUME_NAME}"
docker --context "$DOCKER_CONTEXT" volume inspect "$VOLUME_NAME" >/dev/null

log "等待游戏服任务进入 Running"
server_deadline=$((SECONDS + SERVICE_TIMEOUT_SEC))
server_node=''
while (( SECONDS < server_deadline )); do
  server_node="$(get_preferred_running_service_task_node "$SERVER_SERVICE_NAME" || true)"
  if [[ -n "$server_node" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "$server_node" ]]; then
  log "游戏服在 ${SERVICE_TIMEOUT_SEC} 秒内没有进入 Running"
  show_server_service_ps
  exit 1
fi

show_server_service_ps
log "游戏服当前运行节点: ${server_node}"

log "等待 backup worker 任务进入 Running"
service_deadline=$((SECONDS + SERVICE_TIMEOUT_SEC))
service_running=0
while (( SECONDS < service_deadline )); do
  worker_node="$(get_preferred_running_service_task_node "$SERVICE_NAME" || true)"
  if [[ -n "$worker_node" ]]; then
    service_running=1
    break
  fi
  sleep 5
done

if (( service_running == 0 )); then
  log "backup worker 在 ${SERVICE_TIMEOUT_SEC} 秒内没有进入 Running"
  show_service_ps
  show_service_logs
  exit 1
fi

show_service_ps

log "等待游戏服所在节点看到新鲜的 backup worker 心跳"
heartbeat_deadline=$((SECONDS + HEARTBEAT_TIMEOUT_SEC))
heartbeat_ready=0
while (( SECONDS < heartbeat_deadline )); do
  server_node="$(get_preferred_running_service_task_node "$SERVER_SERVICE_NAME" || true)"
  if [[ -z "$server_node" ]]; then
    sleep 5
    continue
  fi

  remaining_heartbeat_sec=$((heartbeat_deadline - SECONDS))
  if (( remaining_heartbeat_sec <= 0 )); then
    break
  fi

  current_verify_wait_sec="$VERIFY_SERVICE_LOG_TIMEOUT_SEC"
  if (( remaining_heartbeat_sec < current_verify_wait_sec )); then
    current_verify_wait_sec="$remaining_heartbeat_sec"
  fi

  if probe_heartbeat_from_server_node_volume "$server_node" "$current_verify_wait_sec"; then
    heartbeat_ready=1
    break
  fi
  sleep 5
done

if (( heartbeat_ready == 0 )); then
  log "backup worker 心跳在 ${HEARTBEAT_TIMEOUT_SEC} 秒内没有被游戏服节点识别为可用"
  if [[ -n "$VERIFY_SERVICE_LAST_LOGS" ]]; then
    printf '%s\n' "$VERIFY_SERVICE_LAST_LOGS"
  else
    log "游戏服所在节点卷中尚未发现可用心跳输出"
  fi
  if [[ -n "$VERIFY_SERVICE_LAST_STATE" ]]; then
    log "helper 校验任务当前状态: ${VERIFY_SERVICE_LAST_STATE}"
    show_verify_service_ps
  fi
  show_server_service_ps
  show_service_ps
  show_service_logs
  exit 1
fi

if [[ -n "$VERIFY_SERVICE_LAST_LOGS" ]]; then
  printf '%s\n' "$VERIFY_SERVICE_LAST_LOGS"
fi
log "backup worker 校验通过"
