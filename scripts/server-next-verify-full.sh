#!/usr/bin/env sh
# 用途：作为兼容入口调用 server-next verify 的全量验证流程。

set -eu
cd "$(dirname "$0")/.."
node scripts/server-next-verify-full.js
