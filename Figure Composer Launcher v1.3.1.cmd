@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Figure Composer v1.3.1 requires Node.js 20 or newer for this preview launcher.
  pause
  exit /b 1
)
start "Figure Composer v1.3.1" /min /wait node.exe "%~dp0scripts\preview-launcher.mjs" 1.3.1
endlocal
