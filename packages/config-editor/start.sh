#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[config-editor] 构建共享类型"
pnpm --filter @mud/shared build

cleanup() {
  if [[ -n "${VITE_PID:-}" ]]; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "[config-editor] 启动本地 API（含服务托管与自动重启）"
pnpm --filter @mud/config-editor start:api &
API_PID=$!

echo "[config-editor] 启动前端页面"
pnpm --filter @mud/config-editor dev &
VITE_PID=$!

echo "[config-editor] 默认地址 http://127.0.0.1:5174，如端口占用请以 Vite 输出为准"

wait -n "$API_PID" "$VITE_PID"
