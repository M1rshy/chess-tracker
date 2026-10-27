@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "CVT_EXT=%~dp0Chess Vision Extension"
if not exist "%CVT_EXT%\manifest.json" set "CVT_EXT=%~dp0extension-build"
if not exist "%CVT_EXT%\manifest.json" (
  echo Сначала соберите расширение: npm run build:extension
  pause
  exit /b 1
)
set "CVT_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CVT_CHROME%" set "CVT_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if exist "%CVT_CHROME%" (
  start "" "%CVT_CHROME%" "chrome://extensions/"
) else (
  echo Откройте chrome://extensions в вашем браузере.
)
start "" explorer.exe "%CVT_EXT%"
echo Включите Режим разработчика, нажмите Загрузить распакованное расширение.
echo Выберите открытую папку:
echo %CVT_EXT%
echo Затем обновите вкладку шахматного сайта.
pause
