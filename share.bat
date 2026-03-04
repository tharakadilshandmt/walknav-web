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
    pause
    exit /b 1
)

REM Check if the app is running
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 (
    echo [ERROR] WalkNav frontend is not running on port 5173.
    echo         Run start.bat first!
    pause
    exit /b 1
)

echo [INFO] Starting ngrok tunnel...
echo.
echo  When ngrok starts, share the "Forwarding" URL
echo  (e.g. https://xxxx-xxx.ngrok-free.app) with your
echo  supervisor. They can access the full app from that URL.
echo.
echo  Press Ctrl+C to stop the tunnel.
echo.

REM Tunnel port 5173 (frontend) — the frontend calls the API via relative /api path
REM through the nginx reverse proxy or Vite proxy
ngrok http 5173
