#!/bin/bash
# 用途：启动 server-next 本地开发环境并按需拉起依赖服务。

set -euo pipefail

cd "$(dirname "$0")"

# 保存启动模式参数，决定是否进入本地 server-next 开发流程。
MODE="${1:-local}"
# 指定 server-next 本地基础设施使用的 Compose 配置文件。
SERVER_NEXT_COMPOSE_FILE="${SERVER_NEXT_COMPOSE_FILE:-docker-compose.server-next.yml}"
# 指定 server-next 本地 Compose 项目的隔离名称。
SERVER_NEXT_COMPOSE_PROJECT="${SERVER_NEXT_COMPOSE_PROJECT:-mud-next-local}"

# 在脚本结束时回收 server-next、client-next 和 shared-next 监听进程。
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [[ -n "${CLIENT_PID:-}" ]]; then kill "$CLIENT_PID" 2>/dev/null || true; fi
  if [[ -n "${SHARED_WATCH_PID:-}" ]]; then kill "$SHARED_WATCH_PID" 2>/dev/null || true; fi
}

# 终止pidifrunning。
kill_pid_if_running() {
# 记录pid。
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

# 收集当前仓库残留的 server-next 开发相关进程 PID。
collect_repo_dev_pids() {
  ps -eo pid=,args= | awk -v repo_root="$PWD" '
    index($0, repo_root) == 0 { next }
    /packages\/server-next\/dist\/main/ { print $1; next }
    /pnpm\/bin\/pnpm\.cjs --filter @mud\/server-next start:dev/ { print $1; next }
    /packages\/client-next\/node_modules\/\.bin\/\.\.\/vite\/bin\/vite\.js --host/ { print $1; next }
    /packages\/shared-next\/node_modules\/\.bin\/\.\.\/typescript\/bin\/tsc --watch/ { print $1; next }
    /pnpm\/bin\/pnpm\.cjs --filter @mud\/shared-next build --watch/ { print $1; next }
  '
}

# 统一封装带项目名和配置文件的 server-next Compose 调用。
docker_compose_next() {
  docker compose -p "$SERVER_NEXT_COMPOSE_PROJECT" -f "$SERVER_NEXT_COMPOSE_FILE" "$@"
}

# 清理 server-next 或 client-next 端口上的残留监听进程。
kill_port_listener_if_needed() {
# 记录端口。
  local port="$1"
# 记录pid。
  local pid=""
# 记录pid。
  pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -z "$pid" ]]; then
    return 0
  fi

  echo "==> 清理占用端口 ${port} 的残留进程: ${pid}"
  kill_pid_if_running "$pid"
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

# 批量清理本仓库中遗留的 server-next 本地开发进程。
cleanup_existing_local_dev_processes() {
  echo "==> 清理本仓库残留的 server-next 开发进程..."

  mapfile -t repo_pids < <(collect_repo_dev_pids | sort -u)
  for pid in "${repo_pids[@]:-}"; do
    kill_pid_if_running "$pid"
  done

  sleep 1

  for pid in "${repo_pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done

  kill_port_listener_if_needed "${SERVER_NEXT_PORT:-13001}"
  kill_port_listener_if_needed "${CLIENT_NEXT_PORT:-15173}"
}

# 检查脚本所需外部命令是否存在。
require_command() {
# 记录命令名称。
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "!! 缺少命令: $command_name"
    exit 1
  fi
}

# 判断是否本地主机。
is_local_host() {
# 记录主机。
  local host="${1:-localhost}"
  [[ "$host" == "localhost" || "$host" == "127.0.0.1" || "$host" == "::1" ]]
}

# 探测指定主机端口是否已经可连接。
is_tcp_port_open() {
# 记录主机。
  local host="$1"
# 记录端口。
  local port="$2"
  node -e '
    const net = require("node:net");
    const host = process.argv[1];
    const port = Number(process.argv[2]);
    const socket = net.connect({ host, port });
    const fail = () => {
      socket.destroy();
      process.exit(1);
    };
    socket.once("connect", () => {
      socket.end();
      process.exit(0);
    });
    socket.once("error", fail);
    socket.setTimeout(1000, fail);
  ' "$host" "$port" >/dev/null 2>&1
}

# 处理Dockercontainerexists。
docker_container_exists() {
# 记录container名称。
  local container_name="$1"
  docker container inspect "$container_name" >/dev/null 2>&1
}

# 处理trystartexistingcontainer。
try_start_existing_container() {
# 记录container名称。
  local container_name="$1"
# 记录显示信息名称。
  local display_name="$2"

  if ! docker_container_exists "$container_name"; then
    return 1
  fi

  echo "==> 启动已有本地 ${display_name} 容器: ${container_name}"
  docker start "$container_name" >/dev/null
  return 0
}

# 等待 server-next Compose 内的数据库或 Redis 服务就绪。
wait_for_service_healthy() {
# 记录服务名称。
  local service_name="$1"
# 记录显示信息名称。
  local display_name="$2"
# 记录超时时间seconds。
  local timeout_seconds="${3:-60}"
# 记录elapsed。
  local elapsed=0

  echo "==> 等待 ${display_name} 就绪..."

  while (( elapsed < timeout_seconds )); do
# 记录containerID。
    local container_id=""
# 记录containerID。
    container_id="$(docker_compose_next ps -q "$service_name" 2>/dev/null || true)"

    if [[ -n "$container_id" ]]; then
# 记录status。
      local status=""
# 记录status。
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"

      case "$status" in
        healthy|running)
          echo "==> ${display_name} 已就绪"
          return 0
          ;;
        exited|dead)
          echo "!! ${display_name} 容器异常退出，请执行 docker compose logs ${service_name} 排查"
          return 1
          ;;
      esac
    fi

    sleep 1
# 记录elapsed。
    elapsed=$((elapsed + 1))
  done

  echo "!! 等待 ${display_name} 超时，请执行 docker compose ps 或 docker compose logs ${service_name} 排查"
  return 1
}

# 按需拉起 server-next 本地数据库和 Redis 容器，并等待其健康可用。
ensure_local_infra() {
  if [[ "${SKIP_LOCAL_INFRA:-0}" == "1" ]]; then
    echo "==> 已跳过基础设施自动启动 (SKIP_LOCAL_INFRA=1)"
    return 0
  fi

# 记录needspostgres。
  local needs_postgres=0
# 记录needsredis。
  local needs_redis=0
# 记录services。
  local services=()

  if is_local_host "${DB_HOST:-localhost}" && ! is_tcp_port_open "${DB_HOST:-localhost}" "${DB_PORT:-5432}"; then
# 记录needspostgres。
    needs_postgres=1
    services+=("postgres")
  fi

  if is_local_host "${REDIS_HOST:-localhost}" && ! is_tcp_port_open "${REDIS_HOST:-localhost}" "${REDIS_PORT:-6379}"; then
# 记录needsredis。
    needs_redis=1
    services+=("redis")
  fi

  if (( needs_postgres == 0 && needs_redis == 0 )); then
    echo "==> 本地 PostgreSQL / Redis 已可用，跳过容器启动"
    return 0
  fi

  require_command docker

  if ! docker info >/dev/null 2>&1; then
    echo "!! Docker 守护进程未运行，无法自动拉起本地基础设施"
    echo "   请先启动 Docker Desktop 或 docker 服务，再重新执行 ./start-next.sh"
    exit 1
  fi

  if (( needs_postgres == 1 )) && is_local_host "${DB_HOST:-localhost}"; then
    if try_start_existing_container "mud-local-postgres-next" "PostgreSQL"; then
# 记录needspostgres。
      needs_postgres=0
    fi
  fi

  if (( needs_redis == 1 )) && is_local_host "${REDIS_HOST:-localhost}"; then
    if try_start_existing_container "mud-local-redis-next" "Redis"; then
# 记录needsredis。
      needs_redis=0
    fi
  fi

# 记录services。
  services=()
  if (( needs_postgres == 1 )); then
    services+=("postgres")
  fi
  if (( needs_redis == 1 )); then
    services+=("redis")
  fi

  if (( needs_postgres == 0 && needs_redis == 0 )); then
    echo "==> 已恢复本地 PostgreSQL / Redis 容器"
    return 0
  fi

  echo "==> 自动启动本地基础设施容器: ${services[*]}"
  if ! docker_compose_next up -d "${services[@]}"; then
    echo "!! 基础设施容器启动失败"
    echo "   如果你使用的是自带数据库/Redis，请通过 SKIP_LOCAL_INFRA=1 ./start-next.sh 跳过自动拉起"
    exit 1
  fi

  if (( needs_postgres == 1 )); then
    wait_for_service_healthy postgres "PostgreSQL"
  fi

  if (( needs_redis == 1 )); then
    wait_for_service_healthy redis "Redis"
  fi
}

case "$MODE" in
  local)
    echo "==> 本地模式启动 server-next + client-next..."
    echo "==> 编译新线共享包..."
    pnpm --filter @mud/shared-next build

    if [[ -f "packages/server-next/.env" ]]; then
      echo "==> 加载服务端环境配置 packages/server-next/.env ..."
      set -a
      source "packages/server-next/.env"
      set +a
    fi

    export SERVER_NEXT_HOST="${SERVER_NEXT_HOST:-0.0.0.0}"
    export SERVER_NEXT_PORT="${SERVER_NEXT_PORT:-13001}"
    export CLIENT_NEXT_PORT="${CLIENT_NEXT_PORT:-15173}"
    export JWT_SECRET="${JWT_SECRET:-daojie-yusheng-dev-secret}"
    export SERVER_NEXT_GM_PASSWORD="${SERVER_NEXT_GM_PASSWORD:-admin123}"
    export GM_PASSWORD="$SERVER_NEXT_GM_PASSWORD"
    export SERVER_NEXT_RUNTIME_TOKEN="${SERVER_NEXT_RUNTIME_TOKEN:-server-next-dev-runtime-token}"
    export SERVER_NEXT_DB_HOST="${SERVER_NEXT_DB_HOST:-localhost}"
    export DB_HOST="$SERVER_NEXT_DB_HOST"
    export SERVER_NEXT_DB_PORT="${SERVER_NEXT_DB_PORT:-15432}"
    export DB_PORT="$SERVER_NEXT_DB_PORT"
    export SERVER_NEXT_DB_USERNAME="${SERVER_NEXT_DB_USERNAME:-postgres}"
    export DB_USERNAME="$SERVER_NEXT_DB_USERNAME"
    export SERVER_NEXT_DB_PASSWORD="${SERVER_NEXT_DB_PASSWORD:-jiuzhou123}"
    export DB_PASSWORD="$SERVER_NEXT_DB_PASSWORD"
    export SERVER_NEXT_DB_DATABASE="${SERVER_NEXT_DB_DATABASE:-mud_mmo_next}"
    export DB_DATABASE="$SERVER_NEXT_DB_DATABASE"
    export SERVER_NEXT_REDIS_HOST="${SERVER_NEXT_REDIS_HOST:-localhost}"
    export REDIS_HOST="$SERVER_NEXT_REDIS_HOST"
    export SERVER_NEXT_REDIS_PORT="${SERVER_NEXT_REDIS_PORT:-16379}"
    export REDIS_PORT="$SERVER_NEXT_REDIS_PORT"
    export SERVER_NEXT_DATABASE_URL="${SERVER_NEXT_DATABASE_URL:-postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}}"
    export DATABASE_URL="$SERVER_NEXT_DATABASE_URL"
    export SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT="${SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT:-1}"
    export SERVER_NEXT_DEBUG_MOVEMENT="${SERVER_NEXT_DEBUG_MOVEMENT:-${NEXT_DEBUG_MOVEMENT:-0}}"
    export VITE_NEXT_DEBUG_MOVEMENT="${VITE_NEXT_DEBUG_MOVEMENT:-${SERVER_NEXT_DEBUG_MOVEMENT}}"
    export VITE_DEV_PROXY_TARGET="${VITE_DEV_PROXY_TARGET:-http://127.0.0.1:${SERVER_NEXT_PORT}}"

    ensure_local_infra
    cleanup_existing_local_dev_processes

    echo "==> 启动新线共享包监听构建..."
    (pnpm --filter @mud/shared-next build --watch) &
# 记录共享包watchpid。
    SHARED_WATCH_PID=$!

    echo "==> 启动 server-next 热更新模式 (port ${SERVER_NEXT_PORT})..."
    (pnpm --filter @mud/server-next start:dev) &
# 记录服务端pid。
    SERVER_PID=$!

    echo "==> 启动 client-next (port ${CLIENT_NEXT_PORT}, proxy -> ${VITE_DEV_PROXY_TARGET})..."
    (cd packages/client-next && npx vite --host --strictPort --port "${CLIENT_NEXT_PORT}") &
# 记录客户端pid。
    CLIENT_PID=$!

    trap cleanup INT TERM EXIT

    echo ""
    echo "========================================="
    echo "  server-next: http://localhost:${SERVER_NEXT_PORT} (hot reload)"
    echo "  client-next: http://localhost:${CLIENT_NEXT_PORT}"
    echo "  client API : ${VITE_DEV_PROXY_TARGET}"
    echo "  postgres   : localhost:${DB_PORT}/${DB_DATABASE}"
    echo "  redis      : localhost:${REDIS_PORT}"
    echo "  move debug : server=${SERVER_NEXT_DEBUG_MOVEMENT} client=${VITE_NEXT_DEBUG_MOVEMENT}"
    echo "  Ctrl+C 停止所有服务"
    echo "========================================="
    echo ""

    wait
    ;;
  docker)
    echo "==> Docker Compose 模式启动 next 本地栈..."
    docker_compose_next up --build
    ;;
  *)
    echo "用法: ./start-next.sh [local|docker]"
    echo "  local  - 本地直接启动 server-next + client-next (默认)"
    echo "  docker - 使用 docker-compose.server-next.yml 启动 next 本地栈"
    echo ""
    echo "可选环境变量:"
    echo "  SKIP_LOCAL_INFRA=1         跳过本地 PostgreSQL / Redis 自动拉起"
    echo "  SERVER_NEXT_PORT=13001     指定 server-next 端口"
    echo "  CLIENT_NEXT_PORT=15173     指定 client-next 端口"
    echo "  SERVER_NEXT_DB_PORT=15432  指定 next PostgreSQL 端口"
    echo "  SERVER_NEXT_DB_DATABASE=mud_mmo_next 指定 next PostgreSQL 数据库名"
    echo "  SERVER_NEXT_REDIS_PORT=16379 指定 next Redis 端口"
    echo "  NEXT_DEBUG_MOVEMENT=1        同时开启前后端移动诊断日志"
    echo "  VITE_DEV_PROXY_TARGET=...  指定前端代理目标"
    exit 1
    ;;
esac
