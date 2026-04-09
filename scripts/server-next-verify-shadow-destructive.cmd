REM 用途：作为兼容别名转发到 replace-ready 的shadow 破坏性验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的破坏性 shadow流程。

setlocal

node scripts\server-next-verify-shadow-destructive.js
