REM 用途：执行 replace-ready 的带数据库证明链验证流程。
@echo off
REM 用途：作为入口调用 server-next 替换链路的带数据库 proof流程。

setlocal

node scripts\replace-ready-proof-with-db.js
