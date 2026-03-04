@echo off
REM ============================================
REM  WalkNav — Share with Supervisor
REM  Exposes the running app via ngrok tunnel
REM ============================================
REM
REM  Prerequisites:
REM    1. ngrok installed (winget install ngrok.ngrok)
REM    2. ngrok account: https://dashboard.ngrok.com/signup
REM    3. Auth token set: ngrok config add-authtoken YOUR_TOKEN
REM    4. WalkNav running (run start.bat first)
REM

echo.
echo  WalkNav - Share with Supervisor
echo  ================================
echo.

REM Check if ngrok is available
ngrok version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] ngrok is not installed.
    echo         Run: winget install ngrok.ngrok
    echo         Then: ngrok config add-authtoken YOUR_TOKEN
    echo         Get token: https://dashboard.ngrok.com/signup
    pause
    exit /b 1
)

REM Check if the production app is running (nginx on port 80)
curl -sf http://localhost/api/health >nul 2>&1
if errorlevel 1 (
    REM Fallback: check dev mode (port 5173)
    curl -sf http://localhost:5173 >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] WalkNav is not running.
        echo         Run start.bat first!
        pause
        exit /b 1
    )
    echo [INFO] Dev mode detected — tunneling port 5173...
    echo.
    echo  Share the "Forwarding" URL with your supervisor.
    echo  Press Ctrl+C to stop.
    echo.
    ngrok http 5173
    exit /b 0
)

echo [INFO] Production mode detected — tunneling port 80 (Nginx)
echo.
echo  When ngrok starts, share the "Forwarding" URL
echo  (e.g. https://xxxx-xxx.ngrok-free.app) with your
echo  supervisor. They can access the full app from that URL.
echo.
echo  Press Ctrl+C to stop the tunnel.
echo.

REM Tunnel port 80 (nginx reverse proxy) — all API + frontend through one URL
ngrok http 80
