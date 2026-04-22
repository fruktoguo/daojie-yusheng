#!/bin/bash
# 用途：对本地 next shadow 执行完整 destructive proof。
# 默认流程：切维护态 -> preflight -> destructive -> 恢复非维护态。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

restore_shadow() {
  if [[ "${SHADOW_LOCAL_SKIP_RESTORE_AFTER_DESTRUCTIVE:-0}" == "1" ]]; then
    echo "==> 已跳过 destructive 后自动恢复非维护态 (SHADOW_LOCAL_SKIP_RESTORE_AFTER_DESTRUCTIVE=1)"
    return 0
  fi
  bash "${SCRIPT_DIR}/shadow-local-maintenance-off.sh"
}

trap restore_shadow EXIT

export SERVER_SHADOW_ALLOW_DESTRUCTIVE=1

bash "${SCRIPT_DIR}/shadow-local-maintenance-on.sh"
shadow_run_pnpm verify:replace-ready:shadow:destructive:preflight
shadow_run_pnpm verify:replace-ready:shadow:destructive
