@echo off
setlocal
cd /d "%~dp0"
set "CVT_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "CVT_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "dist\index.html" (
  echo Build is missing. Install Node.js 22 LTS and run npm install then npm run build.
  pause
  exit /b 1
)
start "" http://127.0.0.1:4173
"%CVT_NODE%" scripts\serve.mjs
pause
