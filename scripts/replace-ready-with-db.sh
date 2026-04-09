#!/usr/bin/env sh
# 用途：作为入口调用 server-next 替换链路的带数据库验证流程。

set -eu

node scripts/replace-ready-with-db.js
