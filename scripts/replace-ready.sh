#!/usr/bin/env sh
# 用途：作为入口调用 server-next 替换链路的默认验证流程。

set -eu

node scripts/replace-ready.js
