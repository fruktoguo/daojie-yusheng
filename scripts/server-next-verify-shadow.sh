#!/usr/bin/env sh
# 用途：作为兼容入口调用 server-next verify 的shadow流程。

set -eu
cd "$(dirname "$0")/.."
node scripts/server-next-verify-shadow.js
