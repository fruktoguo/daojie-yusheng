REM 用途：执行 replace-ready 的shadow 破坏性验证流程。
@echo off
REM 用途：作为入口调用 server-next 替换链路的破坏性 shadow流程。

setlocal

node scripts\replace-ready-shadow-destructive.js
