#!/usr/bin/env bash
set -euo pipefail

DOCKER_CONTEXT="${DOCKER_CONTEXT:-production}"
STACK_NAME="${STACK_NAME:-daojie-yusheng}"
SERVER_SERVICE_NAME="${SERVER_SERVICE_NAME:-${STACK_NAME}_server}"
SERVICE_NAME="${SERVICE_NAME:-${STACK_NAME}_backup-worker}"
VOLUME_NAME="${VOLUME_NAME:-${STACK_NAME}_server_backup_data}"
HELPER_IMAGE="${BACKUP_WORKER_VERIFY_HELPER_IMAGE:-alpine:3.20}"
SERVICE_TIMEOUT_SEC="${BACKUP_WORKER_SERVICE_TIMEOUT_SEC:-180}"
HEARTBEAT_TIMEOUT_SEC="${BACKUP_WORKER_HEARTBEAT_TIMEOUT_SEC:-180}"
HEARTBEAT_MAX_AGE_MS="${BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS:-60000}"
VERIFY_SERVICE_LOG_TIMEOUT_SEC="${BACKUP_WORKER_VERIFY_SERVICE_LOG_TIMEOUT_SEC:-20}"
VERIFY_SERVICE_NAME="${STACK_NAME}-backup-worker-verify-${RANDOM:-0}-$$"

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

start_verify_service() {
  local target_node="$1"
  docker --context "$DOCKER_CONTEXT" service create \
    --quiet \
    --name "$VERIFY_SERVICE_NAME" \
    --restart-condition none \
    --constraint "node.hostname==${target_node}" \
    --mount "type=volume,source=${VOLUME_NAME},target=/backup" \
    "$HELPER_IMAGE" \
    sh -lc 'if [ -s /backup/_meta/worker-heartbeat.json ]; then cat /backup/_meta/worker-heartbeat.json; else echo "missing-heartbeat-file" >&2; exit 2; fi' \
    >/dev/null
}

read_heartbeat_json_from_server_node_volume() {
  local target_node="$1"
  local max_wait_sec="${2:-$VERIFY_SERVICE_LOG_TIMEOUT_SEC}"
  cleanup
  start_verify_service "$target_node"
  local deadline=$((SECONDS + max_wait_sec))
  while (( SECONDS < deadline )); do
    local logs
    logs="$(docker --context "$DOCKER_CONTEXT" service logs --raw --no-task-ids "$VERIFY_SERVICE_NAME" 2>/dev/null || true)"
    if [[ -n "$logs" ]]; then
      printf '%s\n' "$logs"
      return 0
    fi

    local state
    state="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
    if [[ "$state" == Complete* || "$state" == Failed* || "$state" == Rejected* || "$state" == Shutdown* ]]; then
      break
    fi
    sleep 2
  done
  docker --context "$DOCKER_CONTEXT" service logs --raw --no-task-ids "$VERIFY_SERVICE_NAME" 2>/dev/null || true
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
  current_server_state="$(get_current_service_task_state "$SERVER_SERVICE_NAME" || true)"
  server_node="$(get_current_service_task_node "$SERVER_SERVICE_NAME" || true)"
  if [[ "$current_server_state" == Running* && -n "$server_node" ]]; then
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
  current_worker_state="$(get_current_service_task_state "$SERVICE_NAME" || true)"
  if [[ "$current_worker_state" == Running* ]]; then
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
last_heartbeat_json=''
while (( SECONDS < heartbeat_deadline )); do
  remaining_heartbeat_sec=$((heartbeat_deadline - SECONDS))
  if (( remaining_heartbeat_sec <= 0 )); then
    break
  fi

  current_verify_wait_sec="$VERIFY_SERVICE_LOG_TIMEOUT_SEC"
  if (( remaining_heartbeat_sec < current_verify_wait_sec )); then
    current_verify_wait_sec="$remaining_heartbeat_sec"
  fi

  last_heartbeat_json="$(read_heartbeat_json_from_server_node_volume "$server_node" "$current_verify_wait_sec" || true)"
  if [[ -n "$last_heartbeat_json" ]]; then
    if HEARTBEAT_JSON="$last_heartbeat_json" HEARTBEAT_MAX_AGE_MS="$HEARTBEAT_MAX_AGE_MS" node <<'NODE'
const raw = process.env.HEARTBEAT_JSON ?? '';
const maxAgeMs = Number(process.env.HEARTBEAT_MAX_AGE_MS ?? '60000');

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  console.error(`心跳文件不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const updatedAt = new Date(parsed.updatedAt ?? '');
const updatedAtMs = updatedAt.getTime();
if (!Number.isFinite(updatedAtMs)) {
  console.error(`心跳时间非法: ${String(parsed.updatedAt ?? '')}`);
  process.exit(1);
}

const ageMs = Date.now() - updatedAtMs;
if (ageMs > maxAgeMs) {
  console.error(`心跳已过期: ${parsed.updatedAt}，距今约 ${ageMs} ms`);
  process.exit(1);
}

console.log(`backup worker 心跳正常: ${parsed.hostname ?? 'unknown'}#${parsed.workerPid ?? 'unknown'} ${parsed.updatedAt}`);
NODE
    then
      heartbeat_ready=1
      break
    fi
  fi
  sleep 5
done

if (( heartbeat_ready == 0 )); then
  log "backup worker 心跳在 ${HEARTBEAT_TIMEOUT_SEC} 秒内没有被游戏服节点识别为可用"
  if [[ -n "$last_heartbeat_json" ]]; then
    printf '%s\n' "$last_heartbeat_json"
  else
    log "游戏服所在节点卷中尚未发现 worker-heartbeat.json"
  fi
  verify_task_state="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
  if [[ -n "$verify_task_state" ]]; then
    log "helper 校验任务当前状态: ${verify_task_state}"
    show_verify_service_ps
  fi
  show_server_service_ps
  show_service_ps
  show_service_logs
  exit 1
fi

log "backup worker 校验通过"
