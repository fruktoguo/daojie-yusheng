#!/bin/bash
# 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
# 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
# 用途：对本地 shadow 执行 destructive preflight，无需手动 export destructive 开关。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

export SERVER_SHADOW_ALLOW_DESTRUCTIVE=1
shadow_run_pnpm verify:release:shadow:destructive:preflight
