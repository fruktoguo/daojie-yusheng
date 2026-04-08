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

get_running_service_node() {
  local target_service="$1"
  docker --context "$DOCKER_CONTEXT" service ps "$target_service" --no-trunc --format '{{.CurrentState}}|{{.Node}}' \
    | awk -F'|' '$1 ~ /^Running / { print $2; exit }'
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
  cleanup
  start_verify_service "$target_node"
  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    local state
    state="$(docker --context "$DOCKER_CONTEXT" service ps "$VERIFY_SERVICE_NAME" --no-trunc --format '{{.CurrentState}}' | head -n 1 || true)"
    if [[ "$state" == Running* || "$state" == Complete* || "$state" == Failed* || "$state" == Rejected* || "$state" == Shutdown* ]]; then
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
  server_node="$(get_running_service_node "$SERVER_SERVICE_NAME")"
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
  ps_output="$(docker --context "$DOCKER_CONTEXT" service ps "$SERVICE_NAME" --no-trunc --format '{{.CurrentState}}|{{.Error}}|{{.Node}}|{{.Name}}')"
  if printf '%s\n' "$ps_output" | grep -q '^Running '; then
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
  last_heartbeat_json="$(read_heartbeat_json_from_server_node_volume "$server_node" || true)"
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
  show_server_service_ps
  show_service_ps
  show_service_logs
  exit 1
fi

log "backup worker 校验通过"
