@echo off
setlocal
cd /d "%~dp0.."
node scripts\server-next-verify.js
exit /b %errorlevel%
