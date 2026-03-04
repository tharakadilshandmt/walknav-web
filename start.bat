@echo off
REM ============================================
REM  WalkNav — One-Command Deployment
REM  For supervisor/reviewer: runs the full app
REM ============================================

echo.
echo  WalkNav - Smart Campus Wayfinding
echo  ==================================
echo.

REM Check Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Create .env if it doesn't exist
if not exist .env (
    echo [INFO] Creating .env from template...
    copy .env.example .env >nul
    echo [WARNING] Please edit .env and set MAPBOX_TOKEN before running again.
    notepad .env
    pause
    exit /b 0
)

echo [1/3] Building Docker images...
docker compose build

echo [2/3] Starting all services...
docker compose up -d

echo [3/3] Waiting for services to be healthy...
timeout /t 10 /nobreak >nul

echo.
echo  ====================================
echo   WalkNav is running!
echo  ====================================
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:3001
echo   Health:    http://localhost:3001/api/health
echo.
echo   Admin:     test@test.com / admin1234
echo.
echo   Press any key to stop all services...
echo  ====================================
pause >nul

echo Stopping services...
docker compose down
echo Done!
