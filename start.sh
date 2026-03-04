#!/bin/bash
# ============================================
#  WalkNav — One-Command Production Deployment
#  For supervisor/reviewer: runs the full app
# ============================================

echo ""
echo " WalkNav - Smart Campus Wayfinding"
echo " =================================="
echo ""

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Create .env if needed
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "[INFO] Creating .env from template..."
        cp .env.example .env
        echo "[WARNING] Please edit .env and set MAPBOX_TOKEN, then re-run."
        echo "         Get your token at: https://account.mapbox.com/access-tokens/"
        exit 0
    else
        echo "[ERROR] .env.example not found. Please create .env manually."
        exit 1
    fi
fi

echo "[1/3] Building Docker images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

echo "[2/3] Starting all services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "[3/3] Waiting for services to be healthy..."
echo "       (First run may take 30-60 seconds for database init + seed)"
sleep 20

# Health check with retry
for i in $(seq 1 6); do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        break
    fi
    echo "       Waiting for backend... (attempt $i/6)"
    sleep 10
done

echo ""
echo " ===================================="
echo "  WalkNav is running!"
echo " ===================================="
echo ""
echo "  App:    http://localhost"
echo "  API:    http://localhost/api/health"
echo ""
echo "  Admin:  test@test.com / admin1234"
echo ""
echo "  To stop: docker compose -f docker-compose.yml -f docker-compose.prod.yml down"
echo ""
