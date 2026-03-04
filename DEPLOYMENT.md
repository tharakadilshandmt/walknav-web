# 🐳 WalkNav — Deployment Guide

## Option 1: Local Docker (One Command)

**Prerequisites:** Docker Desktop installed and running.

```bash
# Clone the repository
git clone git@github.com:tharakadilshandmt/walknav-web.git
cd walknav-web

# Windows
start.bat

# Mac/Linux
chmod +x start.sh && ./start.sh
```

This will:
1. Auto-create `.env` with working defaults
2. Build all Docker images (backend, frontend, nginx, database)
3. Start all 4 services (PostgreSQL + PostGIS, Express API, React frontend, Nginx proxy)
4. Auto-seed the database with 892 walking nodes and 2297 edges
5. Create the default admin user

**App URL:** http://localhost  
**Admin login:** `test@test.com` / `admin1234`

### Stop
```bash
# Windows: press any key in the start.bat window
# Or manually:
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

---

## Option 2: Remote Sharing via ngrok

Share the app running on your machine with your supervisor over the internet.

**Prerequisites:**
1. WalkNav running locally (via `start.bat`)
2. ngrok installed: `winget install ngrok.ngrok`
3. ngrok account: https://dashboard.ngrok.com/signup
4. Auth token configured: `ngrok config add-authtoken YOUR_TOKEN`

```bash
# Start the tunnel
share.bat
```

Share the `https://xxxx-xxx.ngrok-free.app` URL with your supervisor. They can access the full app from any browser.

> **Note:** ngrok free tier shows an interstitial page on first visit. The supervisor just needs to click "Visit Site" to proceed.

---

## Option 3: Manual Docker Compose

```bash
cd walknav-web

# Set required environment variables
cp .env.example .env
# Edit .env with your values

# Build and start production stack
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verify
curl http://localhost/api/health

# View logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

---

## Services Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  React SPA   │────▶│    Nginx     │────▶│   Express API        │
│  Mapbox GL   │     │  Port 80     │     │   Port 3001          │
│  (Built)     │     │  (Reverse    │     │   (Internal)         │
└──────────────┘     │   Proxy)     │     └──────────┬───────────┘
                     └──────────────┘                │
                                         ┌───────────▼───────────┐
                                         │  PostgreSQL + PostGIS │
                                         │  Port 5432 (Internal) │
                                         └───────────────────────┘
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| "Docker is not running" | Start Docker Desktop |
| Build fails on frontend | Ensure `.env` has `MAPBOX_TOKEN` set |
| Database connection error | Wait 30s for PostgreSQL to initialize |
| Port 80 already in use | Set `HTTP_PORT=8080` in `.env` |
| ngrok auth error | Run `ngrok config add-authtoken YOUR_TOKEN` |
