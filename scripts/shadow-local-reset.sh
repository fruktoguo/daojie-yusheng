#!/bin/bash
# 用途：重置本地 shadow 到稳定的非维护态，并输出当前状态。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "${SCRIPT_DIR}/shadow-local-down.sh"
bash "${SCRIPT_DIR}/shadow-local-up.sh"
bash "${SCRIPT_DIR}/shadow-local-status.sh"
