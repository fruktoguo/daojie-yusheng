#!/usr/bin/env bash
# 用途：启动配置编辑器前端、本地 API 和 shared 监听构建。

set -euo pipefail

# 记录根目录目录。
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[config-editor] 构建共享类型"
pnpm --filter @mud/shared-next build

echo "[config-editor] 启动共享包监听构建"
pnpm --filter @mud/shared-next build:watch &
# 记录共享包pid。
SHARED_PID=$!

# 清理cleanup。
cleanup() {
  if [[ -n "${SHARED_PID:-}" ]]; then
    kill "$SHARED_PID" 2>/dev/null || true
  fi
  if [[ -n "${VITE_PID:-}" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ "${CONFIG_EDITOR_MANAGE_GAME_SERVER:-0}" == "1" ]]; then
  echo "[config-editor] 启动本地 API（含主游戏服托管与自动重启）"
else
  echo "[config-editor] 启动本地 API（独立模式，不托管主游戏服）"
  echo "[config-editor] 如需托管主游戏服，请使用 CONFIG_EDITOR_MANAGE_GAME_SERVER=1 ./packages/config-editor/start.sh"
fi
pnpm --filter @mud/config-editor start:api &
# 记录APIpid。
API_PID=$!

echo "[config-editor] 启动前端页面"
pnpm --filter @mud/config-editor dev &
# 记录vitepid。
VITE_PID=$!

echo "[config-editor] 默认地址 http://127.0.0.1:5174，如端口占用请以 Vite 输出为准"

wait -n "$SHARED_PID" "$API_PID" "$VITE_PID"
