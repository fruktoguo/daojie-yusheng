@echo off
setlocal
cd /d "%~dp0.."
node scripts\server-next-verify-shadow.js
exit /b %errorlevel%
