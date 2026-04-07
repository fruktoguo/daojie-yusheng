@echo off
setlocal
cd /d "%~dp0.."
node scripts\server-next-verify-full.js
exit /b %errorlevel%
