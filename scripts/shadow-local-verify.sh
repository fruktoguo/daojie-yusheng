#!/bin/bash
# 用途：在当前本地 shadow 上执行只读 shadow 验证。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

shadow_run_pnpm verify:release:shadow
