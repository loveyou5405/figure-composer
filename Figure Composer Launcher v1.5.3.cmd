@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Figure Composer v1.5.3 requires Node.js 20 or newer for this preview launcher.
  pause
  exit /b 1
)
start "Figure Composer v1.5.3" /min /wait node.exe "%~dp0scripts\preview-launcher.mjs" 1.5.3
endlocal
