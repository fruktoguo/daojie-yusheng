#!/usr/bin/env sh
# 用途：作为入口调用 server 替换链路的环境自检流程。

set -eu

node scripts/replace-ready-doctor.js
