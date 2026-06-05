@echo off
echo.
echo  Starting Groove...
echo.

start "Groove - Backend" cmd /k "cd /d %~dp0 && cd backend && python -m flask run"
timeout /t 2 /nobreak >nul
start "Groove - Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo  Both servers starting...
echo  Frontend: http://localhost:8080
echo  Backend:  http://localhost:5000
echo.
pause
