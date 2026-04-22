REM 用途：执行 replace-ready 的带数据库验证流程。
@echo off
REM 用途：作为入口调用 server 替换链路的带数据库验证流程。

setlocal

node scripts\replace-ready-with-db.js
