#!/bin/bash
# 用途：启动 legacy 归档本地开发环境并按需拉起依赖服务。

set -e

cd "$(dirname "$0")"

# 保存启动模式参数，决定走本地开发还是 Docker 启动流程。
MODE="${1:-local}"
# 指定 legacy 归档 docker 启动使用的 Compose 配置文件。
LEGACY_COMPOSE_FILE="${LEGACY_COMPOSE_FILE:-docker-compose.legacy.yml}"

# 统一封装 legacy 归档 compose 调用，避免误用 next 默认 compose。
docker_compose_legacy() {
  docker compose -f "$LEGACY_COMPOSE_FILE" "$@"
}

# 在脚本退出时回收本次拉起的服务端、客户端和共享监听进程。
cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [[ -n "${CLIENT_PID:-}" ]]; then kill "$CLIENT_PID" 2>/dev/null || true; fi
  if [[ -n "${SHARED_WATCH_PID:-}" ]]; then kill "$SHARED_WATCH_PID" 2>/dev/null || true; fi
}

# 安全终止指定 PID 对应的进程，避免重复报错。
kill_pid_if_running() {
# 记录pid。
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

# 收集当前仓库残留的 legacy 开发相关进程 PID。
collect_repo_dev_pids() {
  ps -eo pid=,args= | awk -v repo_root="$PWD" '
    index($0, repo_root) == 0 { next }
    /legacy\/server\/node_modules\/\.bin\/\.\.\/@nestjs\/cli\/bin\/nest\.js start --watch/ { print $1; next }
    /legacy\/server\/dist\/main/ { print $1; next }
    /legacy\/client\/node_modules\/\.bin\/\.\.\/vite\/bin\/vite\.js --host/ { print $1; next }
    /legacy\/shared\/node_modules\/\.bin\/\.\.\/typescript\/bin\/tsc --watch/ { print $1; next }
    /pnpm\/bin\/pnpm\.cjs --filter @mud\/shared build --watch/ { print $1; next }
    /pnpm\/bin\/pnpm\.cjs start:dev/ && /legacy\/server/ { print $1; next }
  '
}

# 清理指定端口上的残留监听进程，避免新实例启动冲突。
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

# 批量清理本仓库已有的本地开发进程和常用端口占用。
cleanup_existing_local_dev_processes() {
  echo "==> 清理本仓库残留的开发进程..."

  mapfile -t repo_pids < <(collect_repo_dev_pids | sort -u)
  for pid in "${repo_pids[@]}"; do
    kill_pid_if_running "$pid"
  done

  sleep 1

  for pid in "${repo_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done

  kill_port_listener_if_needed 3000
  kill_port_listener_if_needed 5173
}

# 检查脚本依赖的外部命令是否可用，缺失时立即退出。
require_command() {
# 记录命令名称。
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "!! 缺少命令: $command_name"
    exit 1
  fi
}

# 判断给定主机名是否属于本机地址。
is_local_host() {
# 记录主机。
  local host="${1:-localhost}"
  [[ "$host" == "localhost" || "$host" == "127.0.0.1" || "$host" == "::1" ]]
}

# 探测目标主机和端口是否已有 TCP 服务监听。
is_tcp_port_open() {
# 记录主机。
  local host="$1"
# 记录端口。
  local port="$2"
  node -e "
    const net = require('node:net');
    const host = process.argv[1];
    const port = Number(process.argv[2]);
    const socket = net.connect({ host, port });
    const fail = () => {
      socket.destroy();
      process.exit(1);
    };
    socket.once('connect', () => {
      socket.end();
      process.exit(0);
    });
    socket.once('error', fail);
    socket.setTimeout(1000, fail);
  " "$host" "$port" >/dev/null 2>&1
}

# 处理Dockercontainerexists。
docker_container_exists() {
# 记录container名称。
  local container_name="$1"
  docker container inspect "$container_name" >/dev/null 2>&1
}

# 优先复用并启动已有的本地基础设施容器。
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

# 轮询等待 Docker Compose 服务进入可用状态。
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
    container_id="$(docker_compose_legacy ps -q "$service_name" 2>/dev/null || true)"

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
          echo "!! ${display_name} 容器异常退出，请执行 docker compose -f ${LEGACY_COMPOSE_FILE} logs ${service_name} 排查"
          return 1
          ;;
      esac
    fi

    sleep 1
# 记录elapsed。
    elapsed=$((elapsed + 1))
  done

  echo "!! 等待 ${display_name} 超时，请执行 docker compose -f ${LEGACY_COMPOSE_FILE} ps 或 docker compose -f ${LEGACY_COMPOSE_FILE} logs ${service_name} 排查"
  return 1
}

# 按需自动拉起本地 PostgreSQL 和 Redis 基础设施。
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
    echo "   请先启动 Docker Desktop 或 docker 服务，再重新执行 ./start.sh"
    exit 1
  fi

  if (( needs_postgres == 1 )) && is_local_host "${DB_HOST:-localhost}"; then
    if try_start_existing_container "mud-local-postgres" "PostgreSQL"; then
# 记录needspostgres。
      needs_postgres=0
    fi
  fi

  if (( needs_redis == 1 )) && is_local_host "${REDIS_HOST:-localhost}"; then
    if try_start_existing_container "mud-local-redis" "Redis"; then
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
  if ! docker_compose_legacy up -d "${services[@]}"; then
    echo "!! 基础设施容器启动失败"
    echo "   如果你使用的是自带数据库/Redis，请通过 SKIP_LOCAL_INFRA=1 ./start.sh 跳过自动拉起"
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
  docker)
    echo "!! 当前脚本只服务于 legacy 归档线；next 默认请使用 ./start-next.sh"
    echo "==> Docker 模式启动..."
    docker_compose_legacy up --build
    ;;
  local)
    echo "!! 当前脚本只服务于 legacy 归档线；next 默认请使用 ./start-next.sh"
    echo "==> 本地模式启动..."
    echo "==> 编译共享包..."
    pnpm --dir legacy/shared build

    if [[ -f "legacy/server/.env" ]]; then
      echo "==> 加载服务端环境配置 legacy/server/.env ..."
      set -a
      # shellcheck disable=SC1091
      source "legacy/server/.env"
      set +a
    fi

    export JWT_SECRET="${JWT_SECRET:-daojie-yusheng-dev-secret}"
    export GM_PASSWORD="${GM_PASSWORD:-admin123}"
    export DB_HOST="${DB_HOST:-localhost}"
    export DB_PORT="${DB_PORT:-5432}"
    export DB_USERNAME="${DB_USERNAME:-postgres}"
    export DB_PASSWORD="${DB_PASSWORD:-postgres}"
    export DB_DATABASE="${DB_DATABASE:-mud_mmo}"
    export REDIS_HOST="${REDIS_HOST:-localhost}"
    export REDIS_PORT="${REDIS_PORT:-6379}"
    export VITE_DEV_PROXY_TARGET="${VITE_DEV_PROXY_TARGET:-http://127.0.0.1:3000}"

    ensure_local_infra
    cleanup_existing_local_dev_processes

    echo "==> 启动共享包监听构建..."
    (pnpm --dir legacy/shared build --watch) &
# 记录共享包watchpid。
    SHARED_WATCH_PID=$!

    echo "==> 启动服务端 (port 3000, watch 模式)..."
    (cd legacy/server && pnpm start:dev) &
# 记录服务端pid。
    SERVER_PID=$!

    echo "==> 启动客户端 (port 5173)..."
    (cd legacy/client && npx vite --host --strictPort) &
# 记录客户端pid。
    CLIENT_PID=$!

    trap cleanup INT TERM EXIT

    echo ""
    echo "========================================="
    echo "  服务端: http://localhost:3000"
    echo "  客户端: http://localhost:5173"
    echo "  共享包: 监听构建中 (legacy/shared/dist)"
    echo "  Ctrl+C 停止所有服务"
    echo "========================================="
    echo ""

    wait
    ;;
  *)
    echo "用法: ./start.sh [local|docker]"
    echo "  local  - 启动 legacy 归档本地环境 (默认)"
    echo "  docker - 启动 legacy 归档 Docker 环境"
    echo ""
    echo "next 主线请改用: ./start-next.sh"
    echo ""
    echo "可选环境变量:"
    echo "  SKIP_LOCAL_INFRA=1  跳过本地 PostgreSQL / Redis 自动拉起"
    exit 1
    ;;
esac
