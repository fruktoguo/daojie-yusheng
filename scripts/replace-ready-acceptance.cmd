REM 用途：执行 replace-ready 的验收验证流程。
@echo off
REM 用途：作为入口调用 server 替换链路的验收验证流程。

setlocal

node scripts\replace-ready-acceptance.js
