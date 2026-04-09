REM 用途：作为兼容别名转发到 replace-ready 的带数据库证明链验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的带数据库 proof流程。

setlocal

node scripts\server-next-verify-proof-with-db.js
