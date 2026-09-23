@echo off
title PharmCanvas
echo Starting PharmCanvas...
cd /d "%~dp0backend"
start "PharmCanvas Backend" cmd /k "call venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
cd /d "%~dp0frontend"
start "PharmCanvas Frontend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173
echo.
echo PharmCanvas is running at http://localhost:5173
echo Press any key to stop both servers.
pause >nul
taskkill /fi "windowtitle eq PharmCanvas Backend*" /t /f >nul 2>&1
taskkill /fi "windowtitle eq PharmCanvas Frontend*" /t /f >nul 2>&1
echo Servers stopped.
