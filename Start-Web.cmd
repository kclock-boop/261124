@echo off
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
    echo Node.js 22.9 or later is required.
    pause
    exit /b 1
)
node --env-file-if-exists=.env scripts\launch.mjs web
if errorlevel 1 pause
