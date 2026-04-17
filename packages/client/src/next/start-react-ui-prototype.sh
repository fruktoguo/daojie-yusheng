#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5173}"
PROTOTYPE_PATH="${PROTOTYPE_PATH:-/react-ui-prototype.html}"

echo "启动前端原型开发服务..."
echo "仓库目录: ${REPO_ROOT}"
echo "访问地址: http://${HOST}:${PORT}${PROTOTYPE_PATH}"
echo
echo "如需改端口，可这样启动:"
echo "  PORT=5174 ${0}"
echo

cd "${REPO_ROOT}"
exec pnpm --filter @mud/client-next dev --host "${HOST}" --port "${PORT}"
