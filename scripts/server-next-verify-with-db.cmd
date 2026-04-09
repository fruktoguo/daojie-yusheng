REM 用途：作为兼容别名转发到 replace-ready 的带数据库验证流程。
@echo off
REM 用途：作为兼容入口调用 server-next verify 的带数据库验证流程。

setlocal
cd /d "%~dp0.."
node scripts\server-next-verify-with-db.js
exit /b %errorlevel%
