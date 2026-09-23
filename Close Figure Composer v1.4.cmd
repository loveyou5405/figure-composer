@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Figure Composer v1.4 requires Node.js 20 or newer for this preview closer.
  pause
  exit /b 1
)
start "Close Figure Composer v1.4" /min /wait node.exe "%~dp0scripts\preview-closer.mjs" 1.4.0
endlocal
