@echo off
REM ============================================
REM  WalkNav — One-Command Deployment
REM  No configuration needed. Just run this.
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

echo [1/3] Pulling Docker images from Docker Hub...
echo         (First run downloads ~500MB. Subsequent runs are instant.)
echo.
docker compose -f docker-compose.supervisor.yml pull

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to pull images. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/3] Starting all services...
docker compose -f docker-compose.supervisor.yml up -d

echo.
echo [3/3] Waiting for services to start...
echo         (Database init + auto-seed on first run takes ~30-60 seconds)
timeout /t 25 /nobreak >nul

REM Health check loop
for /L %%i in (1,1,8) do (
    curl -sf http://localhost/api/health >nul 2>&1
    if not errorlevel 1 goto :health_ok
    echo         Waiting for backend... (attempt %%i/8^)
    timeout /t 10 /nobreak >nul
)

:health_ok
echo.
echo  ====================================
echo   WalkNav is running!
echo  ====================================
echo.
echo   Open in browser:  http://localhost
echo   API health:       http://localhost/api/health
echo.
echo   Admin login:
echo     Email:     test@test.com
echo     Password:  admin1234
echo.
echo   Press any key to STOP all services...
echo  ====================================
pause >nul

echo.
echo  Stopping services...
docker compose -f docker-compose.supervisor.yml down
echo  Done! All services stopped.
