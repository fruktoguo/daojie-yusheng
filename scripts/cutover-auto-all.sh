#!/bin/bash
# 用途：串行执行切换前自动 gate 与切换后机器可验证只读检查。
# 可选：RUN_DESTRUCTIVE_PREFLIGHT=1 时追加 destructive preflight。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> [cutover-auto-all] preflight"
bash "${SCRIPT_DIR}/cutover-auto-preflight.sh"

echo "==> [cutover-auto-all] postcheck"
bash "${SCRIPT_DIR}/cutover-auto-postcheck.sh"

echo "==> [cutover-auto-all] done"
