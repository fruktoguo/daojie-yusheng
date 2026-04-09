REM 用途：作为兼容别名转发到 replace-ready 的全量验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的全量验证流程。

setlocal
cd /d "%~dp0.."
node scripts\server-next-verify-full.js
exit /b %errorlevel%
