# 🐳 WalkNav — Deployment Guide

## For Supervisor: One-Command Run

**Prerequisites:** Docker Desktop installed and running. That's it!

### Option A: Clone and Run
```bash
git clone https://github.com/tharakadilshandmt/walknav-web.git
cd walknav-web
start.bat          # Windows
./start.sh         # Mac/Linux
```

### Option B: Just the Compose File
You only need one file — `docker-compose.supervisor.yml`. Save it and run:
```bash
docker compose -f docker-compose.supervisor.yml up
```

All 4 images are pre-built on **Docker Hub** (`tharaka20/walknav-web`):

| Image | Size | Description |
|-------|------|-------------|
| `tharaka20/walknav-web:db` | ~400MB | PostgreSQL + PostGIS with schema |
| `tharaka20/walknav-web:backend` | ~150MB | Express API + auto-seed |
| `tharaka20/walknav-web:frontend` | ~30MB | React SPA (Mapbox embedded) |
| `tharaka20/walknav-web:nginx` | ~20MB | Reverse proxy |

### Access
| | |
|---|---|
| **App** | http://localhost |
| **Admin** | `test@test.com` / `admin1234` |

### Stop
```bash
docker compose -f docker-compose.supervisor.yml down
```

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  React SPA   │────▶│    Nginx     │────▶│   Express API        │
│  Mapbox GL   │     │  Port 80     │     │   Port 3001          │
└──────────────┘     │  (Proxy)     │     └──────────┬───────────┘
                     └──────────────┘                │
                                         ┌───────────▼───────────┐
                                         │  PostgreSQL + PostGIS │
                                         └───────────────────────┘
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Docker not running | Start Docker Desktop |
| Port 80 in use | Edit `docker-compose.supervisor.yml`, change `"80:80"` to `"8080:80"`, then open http://localhost:8080 |
| Slow first start | Normal — DB init + seed takes ~60s on first run |
| Images not pulling | Check internet connection |
