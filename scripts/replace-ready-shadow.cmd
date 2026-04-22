REM 用途：执行 replace-ready 的shadow 验证流程。
@echo off
REM 用途：作为入口调用 server 替换链路的shadow流程。

setlocal

node scripts\replace-ready-shadow.js
