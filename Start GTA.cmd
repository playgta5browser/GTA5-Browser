@echo off
setlocal
cd /d "%~dp0"
title GTA 5 Browser
where py >nul 2>nul
if errorlevel 1 (set "GTA_PYTHON=python") else (set "GTA_PYTHON=py -3")
if not exist ".venv\Scripts\python.exe" (
  %GTA_PYTHON% -m venv .venv
  if errorlevel 1 goto setup_failed
)
if not exist ".venv\.gta-ready" (
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto setup_failed
  type nul > ".venv\.gta-ready"
)
".venv\Scripts\python.exe" server.py --port 8766 --open
if errorlevel 1 pause
exit /b
:setup_failed
echo Setup failed. Install Python 3.11 or newer and check your internet connection.
pause
exit /b 1
