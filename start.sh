#!/bin/bash
# ============================================
#  WalkNav — One-Command Deployment
#  For supervisor/reviewer: runs the full app
# ============================================

echo ""
echo "  WalkNav - Smart Campus Wayfinding"
echo "  =================================="
echo ""

# Check Docker is running
if ! docker info &>/dev/null; then
    echo "[ERROR] Docker is not running. Please start Docker first."
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "[INFO] Creating .env from template..."
    cp .env.example .env
    echo "[WARNING] Please edit .env and set MAPBOX_TOKEN, then re-run this script."
    exit 0
fi

echo "[1/3] Building Docker images..."
docker compose build

echo "[2/3] Starting all services..."
docker compose up -d

echo "[3/3] Waiting for services to be healthy..."
sleep 10

echo ""
echo "  ===================================="
echo "   WalkNav is running!"
echo "  ===================================="
echo ""
echo "   Frontend:  http://localhost:5173"
echo "   Backend:   http://localhost:3001"
echo "   Health:    http://localhost:3001/api/health"
echo ""
echo "   Admin:     test@test.com / admin1234"
echo ""
echo "   To stop:   docker compose down"
echo "  ===================================="
