@echo off
REM One-click private launcher: builds the latest app, serves it locally, opens the browser.
cd /d "%~dp0"
echo Building the recon dashboard (this runs once per launch)...
call npm run build
if errorlevel 1 ( echo Build failed. & pause & exit /b 1 )
echo Starting private server at http://localhost:5050 ...
start "" http://localhost:5050
node server.mjs
pause
