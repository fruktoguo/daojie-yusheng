REM 用途：执行 replace-ready 的环境自检流程。
@echo off
REM 用途：作为入口调用 server 替换链路的环境自检流程。

setlocal

node scripts\replace-ready-doctor.js
