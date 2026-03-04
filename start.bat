@echo off
REM ============================================
REM  WalkNav — One-Command Production Deployment
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
    copy .env.example .env >nul 2>&1
    if not exist .env (
        echo [ERROR] .env.example not found. Please create .env manually.
        pause
        exit /b 1
    )
    echo [WARNING] Please edit .env and set MAPBOX_TOKEN before running again.
    echo          Get your token at: https://account.mapbox.com/access-tokens/
    notepad .env
    pause
    exit /b 0
)

echo [1/3] Building Docker images (first run may take a few minutes)...
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

if errorlevel 1 (
    echo [ERROR] Docker build failed. Check the output above.
    pause
    exit /b 1
)

echo [2/3] Starting all services...
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo [3/3] Waiting for services to be healthy...
echo         (Database init + auto-seed may take 30-60 seconds on first run...)
timeout /t 20 /nobreak >nul

REM Health check loop
set HEALTHY=0
for /L %%i in (1,1,6) do (
    curl -sf http://localhost/api/health >nul 2>&1
    if not errorlevel 1 (
        set HEALTHY=1
        goto :health_ok
    )
    echo         Waiting for backend... (attempt %%i/6)
    timeout /t 10 /nobreak >nul
)

:health_ok
echo.
echo  ====================================
echo   WalkNav is running!
echo  ====================================
echo.
echo   App:       http://localhost
echo   API:       http://localhost/api/health
echo.
echo   Admin:     test@test.com / admin1234
echo.
echo   To share with supervisor remotely:
echo     Run share.bat (requires ngrok)
echo.
echo   Press any key to stop all services...
echo  ====================================
pause >nul

echo Stopping services...
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
echo Done!
