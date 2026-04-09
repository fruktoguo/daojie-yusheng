#!/usr/bin/env sh
# 用途：作为兼容入口调用 server-next verify 的破坏性 shadow流程。

set -eu

node scripts/server-next-verify-shadow-destructive.js
