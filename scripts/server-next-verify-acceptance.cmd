REM 用途：作为兼容别名转发到 replace-ready 的验收验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的验收验证流程。

setlocal

node scripts\server-next-verify-acceptance.js
