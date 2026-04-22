REM 用途：执行 replace-ready 自动构建、验证与协议审计流程。
@echo off
REM 用途：作为入口调用 server 替换链路的默认验证流程。

setlocal

node scripts\replace-ready.js
