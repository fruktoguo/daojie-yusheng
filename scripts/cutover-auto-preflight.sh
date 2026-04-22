#!/bin/bash
# 用途：自动执行切换前可机器验证的 gate / proof 链。
# 默认覆盖 build、replace-ready、with-db、acceptance、full、doctor 与 cutover proof。
# 可选：RUN_DESTRUCTIVE_PREFLIGHT=1 时追加 destructive preflight。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

shadow_prepare_env
shadow_runtime_dir >/dev/null

LOCK_FILE="${SHADOW_RUNTIME_DIR}/cutover-auto-preflight.lock"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "!! [cutover-auto-preflight] another preflight is already running" >&2
  echo "!! [cutover-auto-preflight] lock=${LOCK_FILE}" >&2
  exit 1
fi

CUTOVER_LOG_ROOT="${SHADOW_RUNTIME_DIR}/cutover-auto-preflight"
CUTOVER_LOG_DIR="${CUTOVER_LOG_ROOT}/$(date +%Y%m%d-%H%M%S)"
mkdir -p "${CUTOVER_LOG_DIR}"

cutover_log_step() {
  local label="$1"
  shift

  local log_key
  log_key="$(printf '%s' "${label}" | tr ' /:' '___')"
  local log_file="${CUTOVER_LOG_DIR}/${log_key}.log"

  echo "==> [cutover-auto-preflight] ${label}"
  echo "    log=${log_file}"

  if [[ "${CUTOVER_AUTO_VERBOSE:-0}" == "1" ]]; then
    "$@"
    echo "==> [cutover-auto-preflight] done ${label}"
    return 0
  fi

  if "$@" >"${log_file}" 2>&1; then
    echo "==> [cutover-auto-preflight] done ${label}"
    return 0
  fi

  local status=$?
  echo "!! [cutover-auto-preflight] failed ${label} status=${status}" >&2
  echo "!! [cutover-auto-preflight] tail ${log_file}" >&2
  tail -n 120 "${log_file}" >&2 || true
  return "${status}"
}

cutover_log_step "build" shadow_run_pnpm build

cutover_log_step "verify:replace-ready" shadow_run_pnpm verify:replace-ready

cutover_log_step "verify:replace-ready:with-db" shadow_run_pnpm verify:replace-ready:with-db

cutover_log_step "verify:replace-ready:acceptance" shadow_run_pnpm verify:replace-ready:acceptance

cutover_log_step "verify:replace-ready:full" shadow_run_pnpm verify:replace-ready:full

cutover_log_step "verify:replace-ready:doctor" shadow_run_pnpm verify:replace-ready:doctor

cutover_log_step "proof:cutover-readiness" shadow_run_pnpm proof:cutover-readiness

cutover_log_step "proof:cutover-preflight" shadow_run_pnpm proof:cutover-preflight

cutover_log_step "proof:cutover-operations" shadow_run_pnpm proof:cutover-operations

if [[ "${RUN_DESTRUCTIVE_PREFLIGHT:-0}" == "1" ]]; then
  cutover_log_step "verify:replace-ready:shadow:destructive:preflight" \
    env SERVER_SHADOW_ALLOW_DESTRUCTIVE="${SERVER_SHADOW_ALLOW_DESTRUCTIVE:-1}" \
    bash -lc "source '${SCRIPT_DIR}/shadow-local-lib.sh' && shadow_run_pnpm verify:replace-ready:shadow:destructive:preflight"
else
  echo "==> [cutover-auto-preflight] destructive preflight skipped (set RUN_DESTRUCTIVE_PREFLIGHT=1 to include it)"
fi

echo "==> [cutover-auto-preflight] done"
echo "==> [cutover-auto-preflight] logs=${CUTOVER_LOG_DIR}"
