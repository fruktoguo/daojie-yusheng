#!/bin/bash
set -e

cd "$(dirname "$0")"

MODE="${1:-local}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [[ -n "${CLIENT_PID:-}" ]]; then kill "$CLIENT_PID" 2>/dev/null || true; fi
  if [[ -n "${SHARED_WATCH_PID:-}" ]]; then kill "$SHARED_WATCH_PID" 2>/dev/null || true; fi
}

case "$MODE" in
  docker)
    echo "==> Docker 模式启动..."
    docker compose up --build
    ;;
  local)
    echo "==> 本地模式启动..."
    echo "==> 编译共享包..."
    pnpm --filter @mud/shared build

    if [[ -f "packages/server/.env" ]]; then
      echo "==> 加载服务端环境配置 packages/server/.env ..."
      set -a
      # shellcheck disable=SC1091
      source "packages/server/.env"
      set +a
    fi

    export JWT_SECRET="${JWT_SECRET:-daojie-yusheng-dev-secret}"
    export GM_PASSWORD="${GM_PASSWORD:-admin123}"
    export DB_HOST="${DB_HOST:-localhost}"
    export DB_PORT="${DB_PORT:-5432}"
    export DB_USERNAME="${DB_USERNAME:-postgres}"
    export DB_PASSWORD="${DB_PASSWORD:-postgres}"
    export DB_DATABASE="${DB_DATABASE:-daojie_yusheng}"
    export REDIS_HOST="${REDIS_HOST:-localhost}"
    export REDIS_PORT="${REDIS_PORT:-6379}"

    echo "==> 启动共享包监听构建..."
    (pnpm --filter @mud/shared build --watch) &
    SHARED_WATCH_PID=$!

    echo "==> 启动服务端 (port 3000, watch 模式)..."
    (cd packages/server && pnpm start:dev) &
    SERVER_PID=$!

    echo "==> 启动客户端 (port 5173)..."
    (cd packages/client && npx vite --host) &
    CLIENT_PID=$!

    trap cleanup INT TERM EXIT

    echo ""
    echo "========================================="
    echo "  服务端: http://localhost:3000"
    echo "  客户端: http://localhost:5173"
    echo "  共享包: 监听构建中 (packages/shared/dist)"
    echo "  Ctrl+C 停止所有服务"
    echo "========================================="
    echo ""

    wait
    ;;
  *)
    echo "用法: ./start.sh [local|docker]"
    echo "  local  - 本地直接启动 (默认)"
    echo "  docker - Docker Compose 启动"
    exit 1
    ;;
esac
