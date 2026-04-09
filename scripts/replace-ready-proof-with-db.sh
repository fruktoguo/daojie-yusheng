#!/usr/bin/env sh
# 用途：作为入口调用 server-next 替换链路的带数据库 proof流程。

set -eu

node scripts/replace-ready-proof-with-db.js
