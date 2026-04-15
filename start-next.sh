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
  kill_process_tree_if_running "${SERVER_PID:-}"
  kill_process_tree_if_running "${CLIENT_PID:-}"
  kill_process_tree_if_running "${SHARED_WATCH_PID:-}"
}

# 终止pidifrunning。
kill_pid_if_running() {
# 记录pid。
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

# 收集指定 PID 的所有后代进程，供批量清理使用。
collect_descendant_pids() {
# 记录根pid。
  local root_pid="$1"
  if [[ -z "$root_pid" ]]; then
    return 0
  fi

  ps -eo pid=,ppid= | awk -v root_pid="$root_pid" '
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

# 递归终止某个进程及其子进程，避免热更新父进程残留。
kill_process_tree_if_running() {
# 记录根pid。
  local root_pid="$1"
  if [[ -z "$root_pid" ]] || ! kill -0 "$root_pid" 2>/dev/null; then
    return 0
  fi

# 记录后代pid列表。
  local descendants=()
  mapfile -t descendants < <(collect_descendant_pids "$root_pid")

# 先结束叶子，再结束根进程，降低子进程游离概率。
  local index=0
  for (( index=${#descendants[@]}-1; index>=0; index-=1 )); do
    kill_pid_if_running "${descendants[$index]}"
  done
  kill_pid_if_running "$root_pid"

  sleep 1

  for (( index=${#descendants[@]}-1; index>=0; index-=1 )); do
    if kill -0 "${descendants[$index]}" 2>/dev/null; then
      kill -9 "${descendants[$index]}" 2>/dev/null || true
    fi
  done
  if kill -0 "$root_pid" 2>/dev/null; then
    kill -9 "$root_pid" 2>/dev/null || true
  fi
}

# 收集当前仓库残留的 server-next 开发相关进程 PID。
collect_repo_dev_pids() {
  ps -eo pid=,args= | awk -v repo_root="$PWD" '
    /pnpm\/bin\/pnpm\.cjs --filter @mud\/server-next start:dev/ { print $1; next }
    /pnpm\/bin\/pnpm\.cjs --filter @mud\/shared-next build --watch/ { print $1; next }
    /node scripts\/dev-hot\.js/ { print $1; next }
    index($0, repo_root) == 0 { next }
    /packages\/server\/dist\/main/ { print $1; next }
    /node_modules\/\.pnpm\/node_modules\/typescript\/bin\/tsc -w -p tsconfig\.json --preserveWatchOutput/ { print $1; next }
    /packages\/client\/node_modules\/\.bin\/\.\.\/vite\/bin\/vite\.js --host/ { print $1; next }
    /packages\/shared\/node_modules\/\.bin\/\.\.\/typescript\/bin\/tsc --watch/ { print $1; next }
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
    kill_process_tree_if_running "$pid"
  done

  kill_port_listener_if_needed "${SERVER_NEXT_PORT:-3000}"
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

# 按固定顺序加载本地 env 文件，用于在本地还原线上部署同名环境变量。
source_env_file_if_present() {
# 记录env文件路径。
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  echo "==> 加载环境配置 ${env_file} ..."
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

# 以“仓库级默认 -> 仓库级本地覆盖 -> 包级默认 -> 包级本地覆盖”顺序加载。
load_server_next_local_env() {
  source_env_file_if_present ".runtime/server-next.local.env"
  source_env_file_if_present ".env"
  source_env_file_if_present ".env.local"
  source_env_file_if_present "packages/server/.env"
  source_env_file_if_present "packages/server/.env.local"
}

# 校验线上部署也要求提供的关键环境变量，避免脚本走私有开发默认值。
require_env_value() {
# 记录环境变量名称。
  local env_name="$1"
# 记录缺失提示。
  local hint="$2"
  if [[ -n "${!env_name:-}" ]]; then
    return 0
  fi

  echo "!! 缺少环境变量: ${env_name}"
  echo "   ${hint}"
  exit 1
}

# 转义 YAML 单引号字符串，避免 docker override 文件被特殊字符打坏。
escape_yaml_single_quoted() {
# 记录原始值。
  local value="${1:-}"
  value="${value//\'/\'\'}"
  printf '%s' "$value"
}

# 为本地 next 启动生成一次性密钥环境，避免回退到硬编码开发密钥。
ensure_server_next_local_secret_env() {
# 记录本地密钥 env 文件。
  local local_env_file=".runtime/server-next.local.env"
# 记录是否需要写入。
  local needs_write=0
# 记录jwt密钥。
  local generated_jwt_secret=""
# 记录运行时令牌。
  local generated_runtime_token=""

  if [[ -z "${JWT_SECRET:-}" ]]; then
    generated_jwt_secret="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
    needs_write=1
  fi

  if [[ -z "${SERVER_NEXT_RUNTIME_TOKEN:-}" ]]; then
    generated_runtime_token="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
    needs_write=1
  fi

  if (( needs_write == 0 )); then
    return 0
  fi

  mkdir -p ".runtime"
  touch "$local_env_file"

  if [[ -n "$generated_jwt_secret" ]] && ! grep -q '^JWT_SECRET=' "$local_env_file"; then
    printf 'JWT_SECRET=%s\n' "$generated_jwt_secret" >> "$local_env_file"
  fi

  if [[ -n "$generated_runtime_token" ]] && ! grep -q '^SERVER_NEXT_RUNTIME_TOKEN=' "$local_env_file"; then
    printf 'SERVER_NEXT_RUNTIME_TOKEN=%s\n' "$generated_runtime_token" >> "$local_env_file"
  fi

  echo "==> 已写入本地 next 密钥缓存 ${local_env_file}"
}

# 准备与线上部署一致的 next 基础环境变量，宿主机或容器网络差异由调用方补充。
prepare_server_next_base_env() {
  load_server_next_local_env
  ensure_server_next_local_secret_env
  load_server_next_local_env

  export SERVER_NEXT_HOST="${SERVER_NEXT_HOST:-0.0.0.0}"
  export SERVER_NEXT_PORT="${SERVER_NEXT_PORT:-3000}"
  export CLIENT_NEXT_PORT="${CLIENT_NEXT_PORT:-15173}"
  export SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT="${SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT:-1}"
  export NEXT_ALLOW_LEGACY_HTTP_COMPAT="${NEXT_ALLOW_LEGACY_HTTP_COMPAT:-$SERVER_NEXT_ALLOW_LEGACY_HTTP_COMPAT}"
  export DB_USERNAME="${DB_USERNAME:-${SERVER_NEXT_DB_USERNAME:-mud}}"
  export SERVER_NEXT_DB_USERNAME="$DB_USERNAME"
  export DB_PASSWORD="${DB_PASSWORD:-${SERVER_NEXT_DB_PASSWORD:-jiuzhou123}}"
  export SERVER_NEXT_DB_PASSWORD="$DB_PASSWORD"
  export DB_DATABASE="${DB_DATABASE:-${SERVER_NEXT_DB_DATABASE:-mud_mmo_next}}"
  export SERVER_NEXT_DB_DATABASE="$DB_DATABASE"
  export GM_PASSWORD="${GM_PASSWORD:-${SERVER_NEXT_GM_PASSWORD:-admin123}}"
  export SERVER_NEXT_GM_PASSWORD="${SERVER_NEXT_GM_PASSWORD:-$GM_PASSWORD}"
  export SERVER_NEXT_GM_DATABASE_BACKUP_DIR="${SERVER_NEXT_GM_DATABASE_BACKUP_DIR:-${GM_DATABASE_BACKUP_DIR:-}}"

  require_env_value "JWT_SECRET" "请按线上部署同名变量提供 JWT_SECRET，可放在 .env/.env.local 或 packages/server/.env(.local)。"
  require_env_value "SERVER_NEXT_RUNTIME_TOKEN" "请按线上部署同名变量提供 SERVER_NEXT_RUNTIME_TOKEN，可放在 .env/.env.local 或 packages/server/.env(.local)。"
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

# 校验 next 本地 PostgreSQL 容器是否仍然停留在旧的初始化账号上。
ensure_local_postgres_env_matches() {
  if ! is_local_host "${DB_HOST:-localhost}"; then
    return 0
  fi

  if ! docker_container_exists "mud-local-postgres-next"; then
    return 0
  fi

# 记录容器中的数据库用户。
  local container_db_user=""
  container_db_user="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' mud-local-postgres-next 2>/dev/null | awk -F= '/^POSTGRES_USER=/{print $2; exit}')"

  if [[ -z "$container_db_user" || "$container_db_user" == "$DB_USERNAME" ]]; then
    return 0
  fi

# 记录数据库卷名。
  local postgres_volume_name="${SERVER_NEXT_COMPOSE_PROJECT}_pgdata_server_next"
  echo "!! 本地 next PostgreSQL 仍是旧初始化口径，当前容器 POSTGRES_USER=${container_db_user}，但脚本已按线上口径要求 DB_USERNAME=${DB_USERNAME}。"
  echo "   请执行以下命令重建 next 本地数据库后再重新启动："
  echo "   docker compose -p ${SERVER_NEXT_COMPOSE_PROJECT} -f ${SERVER_NEXT_COMPOSE_FILE} stop postgres"
  echo "   docker compose -p ${SERVER_NEXT_COMPOSE_PROJECT} -f ${SERVER_NEXT_COMPOSE_FILE} rm -sf postgres"
  echo "   docker volume rm ${postgres_volume_name}"
  echo "   bash ./start-next.sh"
  exit 1
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

    prepare_server_next_base_env
    export DB_HOST="${DB_HOST:-${SERVER_NEXT_DB_HOST:-localhost}}"
    export SERVER_NEXT_DB_HOST="$DB_HOST"
    export DB_PORT="${DB_PORT:-${SERVER_NEXT_DB_PORT:-15432}}"
    export SERVER_NEXT_DB_PORT="$DB_PORT"
    export SERVER_NEXT_REDIS_HOST="${SERVER_NEXT_REDIS_HOST:-localhost}"
    export REDIS_HOST="$SERVER_NEXT_REDIS_HOST"
    export SERVER_NEXT_REDIS_PORT="${SERVER_NEXT_REDIS_PORT:-16379}"
    export REDIS_PORT="$SERVER_NEXT_REDIS_PORT"
    export DATABASE_URL="${DATABASE_URL:-${SERVER_NEXT_DATABASE_URL:-}}"

    if [[ -z "${DATABASE_URL}" ]]; then
      require_env_value "DB_PASSWORD" "未显式提供 DATABASE_URL/SERVER_NEXT_DATABASE_URL 时，需像线上一样提供 DB_PASSWORD 以组装 PostgreSQL 连接串。"
      export DATABASE_URL="postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}"
    fi

    export SERVER_NEXT_DATABASE_URL="${SERVER_NEXT_DATABASE_URL:-$DATABASE_URL}"
    export DATABASE_URL="$SERVER_NEXT_DATABASE_URL"
    export SERVER_NEXT_DEBUG_MOVEMENT="${SERVER_NEXT_DEBUG_MOVEMENT:-${NEXT_DEBUG_MOVEMENT:-0}}"
    export VITE_NEXT_DEBUG_MOVEMENT="${VITE_NEXT_DEBUG_MOVEMENT:-${SERVER_NEXT_DEBUG_MOVEMENT}}"
    export VITE_DEV_PROXY_TARGET="${VITE_DEV_PROXY_TARGET:-http://127.0.0.1:${SERVER_NEXT_PORT}}"

    ensure_local_infra
    ensure_local_postgres_env_matches
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
    (cd packages/client && npx vite --host --strictPort --port "${CLIENT_NEXT_PORT}") &
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
    prepare_server_next_base_env
    require_env_value "DB_PASSWORD" "docker 模式会按线上同名变量拉起 next PostgreSQL，本地也需显式提供 DB_PASSWORD。"

# 记录docker覆盖配置文件。
    docker_override_file=""
    docker_override_file="$(mktemp "${TMPDIR:-/tmp}/start-next.override.XXXXXX.yml")"
    cat > "$docker_override_file" <<EOF
services:
  server-next:
    environment:
      JWT_SECRET: '$(escape_yaml_single_quoted "$JWT_SECRET")'
      SERVER_NEXT_GM_PASSWORD: '$(escape_yaml_single_quoted "$SERVER_NEXT_GM_PASSWORD")'
      GM_PASSWORD: '$(escape_yaml_single_quoted "$GM_PASSWORD")'
EOF

    docker compose -p "$SERVER_NEXT_COMPOSE_PROJECT" -f "$SERVER_NEXT_COMPOSE_FILE" -f "$docker_override_file" up --build
    rm -f "$docker_override_file"
    ;;
  *)
    echo "用法: ./start-next.sh [local|docker]"
    echo "  local  - 本地直接启动 server-next + client-next (默认)"
    echo "  docker - 使用 docker-compose.server-next.yml 启动 next 本地栈"
    echo ""
    echo "可选环境变量:"
    echo "  SKIP_LOCAL_INFRA=1         跳过本地 PostgreSQL / Redis 自动拉起"
    echo "  SERVER_NEXT_PORT=3000      指定 server-next 端口"
    echo "  CLIENT_NEXT_PORT=15173     指定 client-next 端口"
    echo "  DB_USERNAME=mud           指定 next PostgreSQL 用户名"
    echo "  DB_PASSWORD=...           指定 next PostgreSQL 密码"
    echo "  DB_DATABASE=mud_mmo_next  指定 next PostgreSQL 数据库名"
    echo "  DB_PORT=15432             指定 next PostgreSQL 端口"
    echo "  REDIS_PORT=16379          指定 next Redis 端口"
    echo "  JWT_SECRET=...            指定线上同名 JWT 密钥"
    echo "  SERVER_NEXT_RUNTIME_TOKEN=... 指定线上同名运行时令牌"
    echo "  NEXT_DEBUG_MOVEMENT=1     同时开启前后端移动诊断日志"
    echo "  VITE_DEV_PROXY_TARGET=...  指定前端代理目标"
    exit 1
    ;;
esac
