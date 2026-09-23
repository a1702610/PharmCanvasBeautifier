@echo off
title PharmCanvas Setup
echo ============================================
echo   Setting up PharmCanvas...
echo ============================================
echo.
echo Setting up backend...
cd /d "%~dp0backend"
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements-dev.txt
if not exist ".env" copy ".env.example" ".env"
echo Backend setup complete.
echo.
echo Setting up frontend...
cd /d "%~dp0frontend"
call npm install
echo Frontend setup complete.
echo.
echo ============================================
echo   Setup complete! Run start.bat to launch.
echo ============================================
pause
