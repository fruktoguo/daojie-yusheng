#!/bin/bash
# 用途：对本地 shadow 执行 destructive preflight，无需手动 export destructive 开关。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

export SERVER_SHADOW_ALLOW_DESTRUCTIVE=1
shadow_run_pnpm verify:replace-ready:shadow:destructive:preflight
