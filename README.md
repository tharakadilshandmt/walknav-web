# 🧭 WalkNav — Smart Campus Wayfinding

A full-stack web application for pedestrian navigation at **Monash University Clayton**, Melbourne. Provides turn-by-turn directions with multi-modal support (walking, wheelchair, cycling) using a real campus walking network.

## ✨ Features

- 🗺️ Interactive map with terrain-aware walking paths
- 🚶 Multi-modal routing (Walking, Cycling, Wheelchair)
- 📍 Real-time GPS tracking with route deviation detection
- 🗣️ Voice-guided turn-by-turn navigation
- 📱 QR code zone scanning & sharing
- 📊 Admin dashboard with route analytics
- 🔐 JWT auth, RBAC, Helmet CSP, rate limiting

## 🏗 Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  React SPA   │────▶│    Nginx     │────▶│   Express API        │
│  Mapbox GL   │     │  (Reverse    │     │   Dijkstra Routing   │
│  Vite 5      │     │   Proxy)     │     │   JWT Auth           │
└──────────────┘     └──────────────┘     └──────────┬───────────┘
                                                      │
                                          ┌───────────▼───────────┐
                                          │  PostgreSQL + PostGIS │
                                          │  892 nodes, 2297 edges│
                                          └───────────────────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 + Mapbox GL JS 3.7 |
| Backend | Node.js + Express |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Auth | JWT + bcrypt (12 rounds) |
| DevOps | Docker + Docker Compose + GitHub Actions |

## 🚀 Quick Start (Development)

### Prerequisites
- Docker Desktop
- Node.js 20+

### Setup

```bash
# 1. Configure
cp .env.example .env
# Edit .env — set your MAPBOX_TOKEN from https://mapbox.com

# 2. Start database
docker compose up db -d

# 3. Backend
cd backend && npm install
node src/utils/seed.js     # Seed walking network
node src/server.js         # http://localhost:3001

# 4. Frontend (new terminal)
cd frontend && npm install
npx vite --port 5173       # http://localhost:5173
```

**Admin login**: `test@test.com` / `admin1234`

## 🐳 Production Deployment

```bash
# Set required vars
export JWT_SECRET=your-strong-secret
export MAPBOX_TOKEN=pk.your_token
export DB_PASSWORD=strong-db-password

# Build & start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verify
curl http://localhost/api/health
```

| Service | Dev Port | Prod | Description |
|---------|----------|------|-------------|
| Database | 5432 | Internal | PostGIS 16 |
| Backend | 3001 | Internal | Express API |
| Frontend | 5173 | Internal | Nginx static |
| Nginx | — | 80 | Reverse proxy |

## 🧪 Testing

```bash
cd backend
npm test                    # All tests + coverage
npx jest --verbose --forceExit  # Verbose output
```

| Suite | Tests | Status |
|-------|-------|--------|
| Unit — Security | 30 | ✅ |
| Integration — Auth | 14 | ✅ |
| Integration — Routes | 19 | ✅ |
| Integration — Zones | 9 | ✅ |
| Integration — Admin | 16 | ✅ |
| Integration — Weather | 6 | ✅ |
| Security (SRS) | 29 | ✅ |

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Health status + DB info |
| GET | `/api/health/live` | — | Liveness probe |
| GET | `/api/health/ready` | — | Readiness probe |
| POST | `/api/auth/register` | — | Register user |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | ✅ | Current user profile |
| POST | `/api/routes/calculate` | — | Calculate route |
| POST | `/api/routes/snap` | — | Snap GPS to edge |
| GET | `/api/routes/graph` | — | Walking network GeoJSON |
| POST | `/api/routes/history` | ✅ | Save route |
| GET | `/api/routes/history` | ✅ | Route history |
| GET | `/api/zones` | — | List zones |
| GET | `/api/zones/:id/stats` | — | Zone statistics |
| GET | `/api/zones/:id/qr` | — | Zone QR code |
| GET | `/api/weather` | — | Weather proxy |
| GET | `/api/admin/stats` | 🔒 | System stats |
| GET | `/api/admin/users` | 🔒 | User list |
| PATCH | `/api/admin/users/:id/role` | 🔒 | Change role |
| GET | `/api/admin/analytics` | 🔒 | Analytics |

## 📁 Project Structure

```
walknav-web/
├── backend/             # Express REST API
│   ├── src/             # Application source
│   ├── __tests__/       # Jest test suites
│   └── Dockerfile       # Multi-stage (dev + prod)
├── frontend/            # React + Vite SPA
│   ├── src/             # Components, hooks, services
│   └── Dockerfile       # Multi-stage (dev + build + prod)
├── database/            # SQL schema + seed data
├── nginx/               # Reverse proxy config
├── .github/workflows/   # CI/CD pipeline
├── docker-compose.yml   # Development stack
└── docker-compose.prod.yml  # Production overrides
```

## 🔧 Configuration

See [.env.example](.env.example) for all environment variables.

## 📜 License

Developed as part of an academic research project at Monash University.
