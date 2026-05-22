#!/bin/bash
# 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
# 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
# 用途：按固定顺序执行本地 shadow 的整套常用验证链。
# 默认：up -> status -> doctor -> shadow -> acceptance -> full
# 可选：设置 SHADOW_LOCAL_RUN_DESTRUCTIVE=1 后再追加 destructive 全链

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

echo "==> [shadow-local-all] reset"
bash "${SCRIPT_DIR}/shadow-local-reset.sh"

echo "==> [shadow-local-all] doctor"
shadow_run_pnpm verify:release:doctor

echo "==> [shadow-local-all] shadow verify"
bash "${SCRIPT_DIR}/shadow-local-verify.sh"

echo "==> [shadow-local-all] acceptance"
bash "${SCRIPT_DIR}/shadow-local-acceptance.sh"

echo "==> [shadow-local-all] full"
bash "${SCRIPT_DIR}/shadow-local-full.sh"

if [[ "${SHADOW_LOCAL_RUN_DESTRUCTIVE:-0}" == "1" ]]; then
  echo "==> [shadow-local-all] destructive"
  bash "${SCRIPT_DIR}/shadow-local-destructive.sh"
else
  echo "==> [shadow-local-all] destructive skipped (set SHADOW_LOCAL_RUN_DESTRUCTIVE=1 to include it)"
fi

echo "==> [shadow-local-all] done"
