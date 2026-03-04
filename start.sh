#!/bin/bash
# ============================================
#  WalkNav — One-Command Deployment
#  No configuration needed. Just run this.
# ============================================

echo ""
echo " WalkNav - Smart Campus Wayfinding"
echo " =================================="
echo ""

if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker first."
    exit 1
fi

echo "[1/3] Pulling Docker images from Docker Hub..."
docker compose -f docker-compose.supervisor.yml pull

echo ""
echo "[2/3] Starting all services..."
docker compose -f docker-compose.supervisor.yml up -d

echo ""
echo "[3/3] Waiting for services to start..."
sleep 25

for i in $(seq 1 8); do
    if curl -sf http://localhost/api/health > /dev/null 2>&1; then
        break
    fi
    echo "       Waiting for backend... (attempt $i/8)"
    sleep 10
done

echo ""
echo " ===================================="
echo "  WalkNav is running!"
echo " ===================================="
echo ""
echo "  Open:   http://localhost"
echo "  Admin:  test@test.com / admin1234"
echo ""
echo "  To stop: docker compose -f docker-compose.supervisor.yml down"
echo ""
