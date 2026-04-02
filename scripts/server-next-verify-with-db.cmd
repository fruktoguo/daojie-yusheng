@echo off
setlocal
cd /d "%~dp0.."
node scripts\server-next-verify-with-db.js
exit /b %errorlevel%
