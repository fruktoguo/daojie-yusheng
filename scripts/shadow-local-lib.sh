#!/bin/bash
# 用途：提供本地 next shadow 启动、维护态切换、状态查看与停止的共享函数。

set -euo pipefail

SHADOW_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHADOW_REPO_ROOT="$(cd "${SHADOW_LIB_DIR}/.." && pwd)"
SHADOW_RUNTIME_DIR="${SHADOW_REPO_ROOT}/.runtime"
SHADOW_PID_FILE="${SHADOW_RUNTIME_DIR}/server-next-shadow.pid"
SHADOW_LOG_FILE="${SHADOW_RUNTIME_DIR}/server-next-shadow.log"
SHADOW_PORT="${SERVER_NEXT_SHADOW_PORT:-11923}"
SHADOW_URL_DEFAULT="http://127.0.0.1:${SHADOW_PORT}"
SHADOW_COMPOSE_FILE="${SERVER_NEXT_COMPOSE_FILE:-docker-compose.server-next.yml}"
SHADOW_COMPOSE_PROJECT="${SERVER_NEXT_COMPOSE_PROJECT:-mud-next-local}"

shadow_repo_root() {
  printf '%s\n' "${SHADOW_REPO_ROOT}"
}

shadow_runtime_dir() {
  mkdir -p "${SHADOW_RUNTIME_DIR}"
  printf '%s\n' "${SHADOW_RUNTIME_DIR}"
}

shadow_source_env_file_if_present() {
  local env_file="$1"
  if [[ ! -f "${env_file}" ]]; then
    return 0
  fi

  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
}

shadow_load_local_env() {
  cd "${SHADOW_REPO_ROOT}"
  shadow_source_env_file_if_present ".runtime/server-next.local.env"
  shadow_source_env_file_if_present ".env"
  shadow_source_env_file_if_present ".env.local"
  shadow_source_env_file_if_present "packages/server/.env"
  shadow_source_env_file_if_present "packages/server/.env.local"
}

shadow_require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "!! 缺少命令: ${command_name}" >&2
    exit 1
  fi
}

shadow_prepare_env() {
  shadow_load_local_env
  export SERVER_NEXT_HOST="${SERVER_NEXT_HOST:-127.0.0.1}"
  export SERVER_NEXT_PORT="${SERVER_NEXT_PORT:-${SHADOW_PORT}}"
  export SERVER_NEXT_RUNTIME_HTTP="${SERVER_NEXT_RUNTIME_HTTP:-1}"
  export SERVER_NEXT_SHADOW_URL="${SERVER_NEXT_SHADOW_URL:-${SHADOW_URL_DEFAULT}}"
  export SERVER_NEXT_URL="${SERVER_NEXT_URL:-${SERVER_NEXT_SHADOW_URL}}"
  export SERVER_NEXT_DATABASE_URL="${SERVER_NEXT_DATABASE_URL:-${DATABASE_URL:-}}"
  export DATABASE_URL="${DATABASE_URL:-${SERVER_NEXT_DATABASE_URL:-}}"
  export SERVER_NEXT_GM_PASSWORD="${SERVER_NEXT_GM_PASSWORD:-${GM_PASSWORD:-}}"
  export GM_PASSWORD="${GM_PASSWORD:-${SERVER_NEXT_GM_PASSWORD:-}}"

  if [[ -z "${SERVER_NEXT_DATABASE_URL:-}" ]]; then
    echo "!! 缺少环境变量: SERVER_NEXT_DATABASE_URL 或 DATABASE_URL" >&2
    exit 1
  fi
  if [[ -z "${SERVER_NEXT_GM_PASSWORD:-}" ]]; then
    echo "!! 缺少环境变量: SERVER_NEXT_GM_PASSWORD 或 GM_PASSWORD" >&2
    exit 1
  fi
  if [[ -z "${SERVER_NEXT_PLAYER_TOKEN_SECRET:-${NEXT_PLAYER_TOKEN_SECRET:-}}" ]]; then
    echo "!! 缺少环境变量: SERVER_NEXT_PLAYER_TOKEN_SECRET 或 NEXT_PLAYER_TOKEN_SECRET" >&2
    exit 1
  fi
  if [[ -z "${SERVER_NEXT_RUNTIME_TOKEN:-}" ]]; then
    echo "!! 缺少环境变量: SERVER_NEXT_RUNTIME_TOKEN" >&2
    exit 1
  fi
}

shadow_docker_compose_next() {
  (
    cd "${SHADOW_REPO_ROOT}"
    docker compose -p "${SHADOW_COMPOSE_PROJECT}" -f "${SHADOW_COMPOSE_FILE}" "$@"
  )
}

shadow_ensure_local_infra() {
  if [[ "${SHADOW_LOCAL_SKIP_INFRA:-0}" == "1" ]]; then
    echo "==> 已跳过本地基础设施启动 (SHADOW_LOCAL_SKIP_INFRA=1)"
    return 0
  fi

  shadow_require_command docker
  echo "==> 确保本地 next PostgreSQL / Redis 已启动..."
  shadow_docker_compose_next up -d postgres redis >/dev/null
}

shadow_compile_server() {
  if [[ "${SHADOW_LOCAL_SKIP_COMPILE:-0}" == "1" ]]; then
    echo "==> 已跳过 server-next 编译 (SHADOW_LOCAL_SKIP_COMPILE=1)"
    return 0
  fi

  echo "==> 编译 server-next ..."
  (
    cd "${SHADOW_REPO_ROOT}"
    pnpm --filter @mud/server-next compile
  )
}

shadow_collect_children() {
  local root_pid="$1"
  ps -eo pid=,ppid= | awk -v root_pid="${root_pid}" '
    {
      children[$2] = children[$2] " " $1
    }
    function walk(pid, child_count, child_ids, child_idx) {
      child_count = split(children[pid], child_ids, " ")
      for (child_idx = 1; child_idx <= child_count; child_idx += 1) {
        if (child_ids[child_idx] == "") {
          continue
        }
        print child_ids[child_idx]
        walk(child_ids[child_idx])
      }
    }
    END {
      walk(root_pid)
    }
  '
}

shadow_kill_tree_if_running() {
  local root_pid="$1"
  if [[ -z "${root_pid}" ]] || ! kill -0 "${root_pid}" 2>/dev/null; then
    return 0
  fi

  local descendants=()
  mapfile -t descendants < <(shadow_collect_children "${root_pid}")

  local idx=0
  for (( idx=${#descendants[@]}-1; idx>=0; idx-=1 )); do
    kill "${descendants[$idx]}" 2>/dev/null || true
  done
  kill "${root_pid}" 2>/dev/null || true
  sleep 1
  for (( idx=${#descendants[@]}-1; idx>=0; idx-=1 )); do
    if kill -0 "${descendants[$idx]}" 2>/dev/null; then
      kill -9 "${descendants[$idx]}" 2>/dev/null || true
    fi
  done
  if kill -0 "${root_pid}" 2>/dev/null; then
    kill -9 "${root_pid}" 2>/dev/null || true
  fi
}

shadow_stop_existing() {
  shadow_runtime_dir >/dev/null

  if [[ -f "${SHADOW_PID_FILE}" ]]; then
    local pid=""
    pid="$(cat "${SHADOW_PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${pid}" ]]; then
      echo "==> 停止现有本地 shadow 进程: ${pid}"
      shadow_kill_tree_if_running "${pid}"
    fi
    rm -f "${SHADOW_PID_FILE}"
  fi

  local port_pid=""
  port_pid="$(lsof -tiTCP:${SHADOW_PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${port_pid}" ]]; then
    echo "==> 清理占用 ${SHADOW_PORT} 端口的残留进程: ${port_pid}"
    shadow_kill_tree_if_running "${port_pid}"
  fi
}

shadow_wait_for_health() {
  local expected_maintenance="$1"
  local timeout_seconds="${2:-60}"
  local health_url="${SERVER_NEXT_SHADOW_URL:-${SHADOW_URL_DEFAULT}}/health"
  local elapsed=0
  local response=""

  while (( elapsed < timeout_seconds )); do
    response="$(curl -sS -m 2 "${health_url}" || true)"
    if [[ -n "${response}" ]]; then
      if [[ "${expected_maintenance}" == "1" ]]; then
        if grep -q '"active":true' <<<"${response}"; then
          printf '%s\n' "${response}"
          return 0
        fi
      else
        if grep -q '"ok":true' <<<"${response}" && grep -q '"active":false' <<<"${response}"; then
          printf '%s\n' "${response}"
          return 0
        fi
      fi
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  if [[ -n "${response}" ]]; then
    printf '%s\n' "${response}"
  fi
  echo "!! 等待 shadow /health 超时" >&2
  return 1
}

shadow_start() {
  local maintenance_flag="${1:-0}"

  shadow_prepare_env
  shadow_ensure_local_infra
  shadow_compile_server
  shadow_stop_existing
  shadow_runtime_dir >/dev/null

  if [[ "${maintenance_flag}" == "1" ]]; then
    export SERVER_NEXT_RUNTIME_MAINTENANCE=1
  else
    unset SERVER_NEXT_RUNTIME_MAINTENANCE || true
  fi

  echo "==> 启动本地 next shadow (maintenance=${maintenance_flag}) ..."
  (
    cd "${SHADOW_REPO_ROOT}"
    if command -v setsid >/dev/null 2>&1; then
      SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1 SERVER_NEXT_SMOKE_ALLOW_UNREADY=1 \
        setsid node packages/server/dist/main.js >> "${SHADOW_LOG_FILE}" 2>&1 < /dev/null &
    else
      SERVER_NEXT_ALLOW_UNREADY_TRAFFIC=1 SERVER_NEXT_SMOKE_ALLOW_UNREADY=1 \
        nohup node packages/server/dist/main.js >> "${SHADOW_LOG_FILE}" 2>&1 < /dev/null &
    fi
    echo "$!" > "${SHADOW_PID_FILE}"
  )

  local health_payload=""
  health_payload="$(shadow_wait_for_health "${maintenance_flag}")"
  echo "==> shadow 已启动"
  printf '%s\n' "${health_payload}"
}

shadow_status() {
  shadow_prepare_env

  local pid=""
  if [[ -f "${SHADOW_PID_FILE}" ]]; then
    pid="$(cat "${SHADOW_PID_FILE}" 2>/dev/null || true)"
  fi

  echo "shadow_url=${SERVER_NEXT_SHADOW_URL:-${SHADOW_URL_DEFAULT}}"
  echo "shadow_port=${SHADOW_PORT}"
  echo "pid=${pid:-none}"
  echo "log=${SHADOW_LOG_FILE}"

  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "process=running"
  else
    if [[ -n "${pid}" ]]; then
      rm -f "${SHADOW_PID_FILE}"
    fi
    echo "process=stopped"
  fi

  local response=""
  response="$(curl -sS -m 2 "${SERVER_NEXT_SHADOW_URL:-${SHADOW_URL_DEFAULT}}/health" || true)"
  if [[ -n "${response}" ]]; then
    echo "health=${response}"
  else
    echo "health=unreachable"
  fi
}

shadow_down() {
  shadow_stop_existing
  echo "==> 本地 shadow 已停止"
}

shadow_run_repo_command() {
  shadow_prepare_env
  (
    cd "${SHADOW_REPO_ROOT}"
    "$@"
  )
}

shadow_run_pnpm() {
  shadow_run_repo_command pnpm "$@"
}
