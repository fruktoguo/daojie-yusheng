#!/usr/bin/env bash
# 用途：验证 backup worker 服务心跳与卷挂载是否正常。

set -euo pipefail

# 指定本次校验使用的 Docker 上下文环境。
DOCKER_CONTEXT="${DOCKER_CONTEXT:-production}"
# 作为服务名、卷名和临时校验任务命名的栈前缀。
STACK_NAME="${STACK_NAME:-daojie-yusheng}"
# 记录服务端服务名称。
SERVER_SERVICE_NAME="${SERVER_SERVICE_NAME:-${STACK_NAME}_server}"
# 记录服务名称。
SERVICE_NAME="${SERVICE_NAME:-${STACK_NAME}_backup-worker}"
# 记录volume名称。
VOLUME_NAME="${VOLUME_NAME:-${STACK_NAME}_server_backup_data}"
# 记录辅助项image。
HELPER_IMAGE="${BACKUP_WORKER_VERIFY_HELPER_IMAGE:-}"
# 记录服务超时时间sec。
SERVICE_TIMEOUT_SEC="${BACKUP_WORKER_SERVICE_TIMEOUT_SEC:-180}"
# 记录心跳超时时间sec。
HEARTBEAT_TIMEOUT_SEC="${BACKUP_WORKER_HEARTBEAT_TIMEOUT_SEC:-180}"
# 记录心跳maxagems。
HEARTBEAT_MAX_AGE_MS="${BACKUP_WORKER_HEARTBEAT_MAX_AGE_MS:-60000}"
# 记录校验服务log超时时间sec。
VERIFY_SERVICE_LOG_TIMEOUT_SEC="${BACKUP_WORKER_VERIFY_SERVICE_LOG_TIMEOUT_SEC:-20}"
# 保存临时创建的 backup worker 校验服务名称。
VERIFY_SERVICE_NAME="${STACK_NAME}-backup-worker-verify-${RANDOM:-0}-$$"
# 记录最近一次辅助校验服务的状态，便于失败排查。
VERIFY_SERVICE_LAST_STATE=''
# 缓存最近一次辅助校验服务的输出日志。
VERIFY_SERVICE_LAST_LOGS=''

# 统一输出带脚本前缀的校验日志。
log() {
  printf '[verify-backup-worker] %s\n' "$*"
}

# 删除临时创建的辅助校验服务，避免脚本退出后留下垃圾任务。
cleanup() {
  docker --context "$DOCKER_CONTEXT" service rm "$VERIFY_SERVICE_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

# 展示服务ps。
show_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$SERVICE_NAME" --no-trunc || true
}

# 展示服务logs。
show_service_logs() {
  docker --context "$DOCKER_CONTEXT" service logs --tail 200 "$SERVICE_NAME" || true
}

# 展示服务端服务ps。
show_server_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$SERVER_SERVICE_NAME" --no-trunc || true
}

# 展示校验服务ps。
show_verify_service_ps() {
  docker --context "$DOCKER_CONTEXT" service ps "$VERIFY_SERVICE_NAME" --no-trunc || true
}

# 获取Dockerdaemonhostname。
get_docker_daemon_hostname() {
  docker --context "$DOCKER_CONTEXT" info --format '{{.Name}}' 2>/dev/null || true
}

# 校验心跳文件内容是否是包含 updatedAt 的合法 JSON。
is_valid_heartbeat_json() {
# 记录raw。
  local raw="$1"
  if [[ -z "$raw" ]]; then
    return 1
  fi
# 记录心跳json。
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

# 读取指定 Swarm 服务当前任务的目标字段值。
get_current_service_task_field() {
# 记录目标服务。
  local target_service="$1"
# 记录field索引。
  local field_index="$2"
  docker --context "$DOCKER_CONTEXT" service ps "$target_service" --no-trunc --format '{{.Name}}|{{.CurrentState}}|{{.DesiredState}}|{{.Node}}' \
    | awk -F'|' -v field_index="$field_index" '$1 !~ /^\\_/ { print $field_index; exit }'
}

# 获取当前值服务task状态。
get_current_service_task_state() {
  get_current_service_task_field "$1" 2
}

# 获取当前值服务task节点。
get_current_service_task_node() {
  get_current_service_task_field "$1" 4
}

# 获取running服务taskfield。
get_running_service_task_field() {
# 记录目标服务。
  local target_service="$1"
# 记录field索引。
  local field_index="$2"
  docker --context "$DOCKER_CONTEXT" service ps "$target_service" --no-trunc --format '{{.Name}}|{{.CurrentState}}|{{.DesiredState}}|{{.Node}}' \
    | awk -F'|' -v field_index="$field_index" '$2 ~ /^Running / { print $field_index; exit }'
}

# 获取running服务task节点。
get_running_service_task_node() {
  get_running_service_task_field "$1" 4
}

# 优先返回当前活跃任务所在节点，找不到时回退到任意 Running 节点。
get_preferred_running_service_task_node() {
# 记录目标服务。
  local target_service="$1"
  local current_state
# 记录当前值状态。
  current_state="$(get_current_service_task_state "$target_service" || true)"
  if [[ "$current_state" == Running* ]]; then
    get_current_service_task_node "$target_service"
    return 0
  fi
  get_running_service_task_node "$target_service"
}

# 解析执行卷内心跳探测时所需的辅助镜像名称。
resolve_helper_image() {
  if [[ -n "$HELPER_IMAGE" ]]; then
    printf '%s\n' "$HELPER_IMAGE"
    return 0
  fi

  docker --context "$DOCKER_CONTEXT" service inspect "$SERVICE_NAME" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
}

# 在目标节点上创建一次性辅助服务，读取并检查备份卷中的心跳文件。
start_verify_service() {
# 记录目标节点。
  local target_node="$1"
# 记录辅助项image。
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
# 记录文件。
      file=/backup/_meta/worker-heartbeat.json
      if [ ! -s "$file" ]; then
        echo "missing-heartbeat-file" >&2
        exit 2
      fi
# 记录mtime。
      mtime="$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")"
# 记录now。
      now="$(date +%s)"
# 记录agems。
      age_ms=$(( (now - mtime) * 1000 ))
      if [ "$age_ms" -gt "${HEARTBEAT_MAX_AGE_MS:-60000}" ]; then
        echo "stale-heartbeat-file:${age_ms}ms" >&2
        exit 3
      fi
      cat "$file"
    ' \
    >/dev/null
}

# 尝试直接从当前 Docker 守护进程所在节点挂载卷并读取心跳。
probe_heartbeat_from_local_daemon_volume() {
# 记录目标节点。
  local target_node="$1"
# 记录maxwaitsec。
  local max_wait_sec="${2:-$VERIFY_SERVICE_LOG_TIMEOUT_SEC}"
  local daemon_hostname
# 记录daemonhostname。
  daemon_hostname="$(get_docker_daemon_hostname)"
  if [[ -z "$daemon_hostname" || "$daemon_hostname" != "$target_node" ]]; then
    return 2
  fi

  local helper_image
# 记录辅助项image。
  helper_image="$(resolve_helper_image)"

# 记录输出。
  local output=''
# 记录status。
  local status=0
# 记录输出。
  output="$(timeout "${max_wait_sec}s" docker --context "$DOCKER_CONTEXT" run --rm \
    --mount "type=volume,source=${VOLUME_NAME},target=/backup" \
    --env "HEARTBEAT_MAX_AGE_MS=${HEARTBEAT_MAX_AGE_MS}" \
    "$helper_image" \
    sh -lc '
      set -eu
# 记录文件。
      file=/backup/_meta/worker-heartbeat.json
      if [ ! -s "$file" ]; then
        echo "missing-heartbeat-file" >&2
        exit 2
      fi
# 记录mtime。
      mtime="$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")"
# 记录now。
      now="$(date +%s)"
# 记录agems。
      age_ms=$(( (now - mtime) * 1000 ))
      if [ "$age_ms" -gt "${HEARTBEAT_MAX_AGE_MS:-60000}" ]; then
        echo "stale-heartbeat-file:${age_ms}ms" >&2
        exit 3
      fi
      cat "$file"
    ' 2>&1)" || status=$?

  # 记录最近一次辅助校验服务的状态，便于失败排查。
  VERIFY_SERVICE_LAST_STATE="direct-run-exit:${status}"
  # 缓存最近一次辅助校验服务的输出日志。
  VERIFY_SERVICE_LAST_LOGS="$output"
  if is_valid_heartbeat_json "$output"; then
    return 0
  fi
  return 1
}

# 确保在游戏服所在节点上验证备份卷心跳是否新鲜可用。
probe_heartbeat_from_server_node_volume() {
# 记录目标节点。
  local target_node="$1"
# 记录maxwaitsec。
  local max_wait_sec="${2:-$VERIFY_SERVICE_LOG_TIMEOUT_SEC}"
  if probe_heartbeat_from_local_daemon_volume "$target_node" "$max_wait_sec"; then
    return 0
  else
# 记录directprobestatus。
    local direct_probe_status=$?
    if (( direct_probe_status != 2 )); then
      return 1
    fi
  fi

  local helper_image
# 记录辅助项image。
  helper_image="$(resolve_helper_image)"

  # 记录最近一次辅助校验服务的状态，便于失败排查。
  VERIFY_SERVICE_LAST_STATE=''
  # 缓存最近一次辅助校验服务的输出日志。
  VERIFY_SERVICE_LAST_LOGS=''
  cleanup
  start_verify_service "$target_node" "$helper_image"
# 记录deadline。
  local deadline=$((SECONDS + max_wait_sec))
  while (( SECONDS < deadline )); do
    local logs
# 记录logs。
    logs="$(docker --context "$DOCKER_CONTEXT" service logs --raw --no-task-ids "$VERIFY_SERVICE_NAME" 2>/dev/null || true)"
    if is_valid_heartbeat_json "$logs"; then
      # 记录最近一次辅助校验服务的状态，便于失败排查。
      VERIFY_SERVICE_LAST_STATE="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
      # 缓存最近一次辅助校验服务的输出日志。
      VERIFY_SERVICE_LAST_LOGS="$logs"
      return 0
    fi

    local state
# 记录状态。
    state="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
    if [[ "$state" == Complete* ]]; then
      # 记录最近一次辅助校验服务的状态，便于失败排查。
      VERIFY_SERVICE_LAST_STATE="$state"
      # 缓存最近一次辅助校验服务的输出日志。
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
  # 记录最近一次辅助校验服务的状态，便于失败排查。
  VERIFY_SERVICE_LAST_STATE="$(get_current_service_task_state "$VERIFY_SERVICE_NAME" || true)"
  # 缓存最近一次辅助校验服务的输出日志。
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
# 记录服务端deadline。
server_deadline=$((SECONDS + SERVICE_TIMEOUT_SEC))
# 记录服务端节点。
server_node=''
while (( SECONDS < server_deadline )); do
# 记录服务端节点。
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
# 记录服务deadline。
service_deadline=$((SECONDS + SERVICE_TIMEOUT_SEC))
# 记录服务running。
service_running=0
while (( SECONDS < service_deadline )); do
# 记录worker节点。
  worker_node="$(get_preferred_running_service_task_node "$SERVICE_NAME" || true)"
  if [[ -n "$worker_node" ]]; then
# 记录服务running。
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
# 保存等待 backup worker 心跳就绪的最终超时时刻。
heartbeat_deadline=$((SECONDS + HEARTBEAT_TIMEOUT_SEC))
# 记录心跳就绪状态。
heartbeat_ready=0
while (( SECONDS < heartbeat_deadline )); do
# 记录服务端节点。
  server_node="$(get_preferred_running_service_task_node "$SERVER_SERVICE_NAME" || true)"
  if [[ -z "$server_node" ]]; then
    sleep 5
    continue
  fi

# 记录remaining心跳sec。
  remaining_heartbeat_sec=$((heartbeat_deadline - SECONDS))
  if (( remaining_heartbeat_sec <= 0 )); then
    break
  fi

# 记录当前值校验waitsec。
  current_verify_wait_sec="$VERIFY_SERVICE_LOG_TIMEOUT_SEC"
  if (( remaining_heartbeat_sec < current_verify_wait_sec )); then
# 记录当前值校验waitsec。
    current_verify_wait_sec="$remaining_heartbeat_sec"
  fi

  if probe_heartbeat_from_server_node_volume "$server_node" "$current_verify_wait_sec"; then
# 记录心跳就绪状态。
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
