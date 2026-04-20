#!/bin/bash
# 用途：启动本地 next shadow（非维护态）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/shadow-local-lib.sh"

shadow_start 0
