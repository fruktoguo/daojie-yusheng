#!/usr/bin/env sh
# 用途：作为兼容入口调用 server-next verify 的带数据库 proof流程。

set -eu

node scripts/server-next-verify-proof-with-db.js
