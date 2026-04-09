#!/usr/bin/env sh
# 用途：作为兼容入口调用 server-next verify 的验收验证流程。

set -eu

node scripts/server-next-verify-acceptance.js
