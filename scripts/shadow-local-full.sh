#!/bin/bash
# 用途：在当前本地环境上执行 full 验证。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

shadow_run_pnpm verify:replace-ready:full
