REM 用途：作为兼容别名转发到 replace-ready 验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的默认验证流程。

setlocal
cd /d "%~dp0.."
node scripts\server-next-verify.js
exit /b %errorlevel%
