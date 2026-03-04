# 📡 WalkNav API Documentation

**Base URL:** `http://localhost:3001/api` (dev) or `http://localhost/api` (production)

---

## Authentication

### Register User
```
POST /api/auth/register
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "name": "User Name"
}
```

**Response:** `201`
```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "email": "user@example.com", "name": "User Name", "role": "visitor" }
}
```

### Login
```
POST /api/auth/login
Content-Type: application/json
```

**Body:**
```json
{ "email": "user@example.com", "password": "password123" }
```

**Response:** `200` — same shape as register

### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>
```

**Response:** `200`
```json
{ "id": 1, "email": "user@example.com", "name": "User Name", "role": "visitor" }
```

---

## Routes & Navigation

### Calculate Route
```
POST /api/routes/calculate
Content-Type: application/json
```

**Body:**
```json
{
  "startLat": -37.9105, "startLng": 145.1340,
  "endLat": -37.9115, "endLng": 145.1360,
  "mode": "walk"
}
```

Modes: `walk`, `wheelchair`, `cycling`

**Response:** `200`
```json
{
  "path": ["node_id_1", "node_id_2", ...],
  "coordinates": [[145.134, -37.910], ...],
  "distance": 250.5,
  "duration": 180.3,
  "steps": [
    { "instruction": "Head north", "distance": 50, "coordinates": [...] }
  ]
}
```

### Snap to Edge
```
POST /api/routes/snap
Content-Type: application/json
```

**Body:** `{ "lat": -37.9105, "lng": 145.1340 }`

**Response:** `200`
```json
{ "node_id": "closest_node_id", "lat": -37.9105, "lng": 145.1340, "distance": 12.5 }
```

### Get Walking Network
```
GET /api/routes/graph
```

**Response:** `200` — GeoJSON FeatureCollection of all nodes and edges

### Save Route History
```
POST /api/routes/history
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "start_node": "node_1", "end_node": "node_2",
  "path": ["node_1", "node_3", "node_2"],
  "distance": 250.5, "duration": 180.3, "mode": "walk"
}
```

### Get Route History
```
GET /api/routes/history
Authorization: Bearer <token>
```

---

## Zones

### List Zones
```
GET /api/zones
```

### Zone Statistics
```
GET /api/zones/:id/stats
```

### Zone QR Code
```
GET /api/zones/:id/qr
```

**Response:** PNG image of QR code

---

## Weather

### Get Weather
```
GET /api/weather?lat=-37.9105&lng=145.1340
```

**Response:** `200`
```json
{
  "temperature": 22.5, "windspeed": 12.3,
  "weathercode": 1, "description": "Partly cloudy"
}
```

---

## Admin (Requires `admin` role)

### System Stats
```
GET /api/admin/stats
Authorization: Bearer <admin-token>
```

### User List
```
GET /api/admin/users
Authorization: Bearer <admin-token>
```

### Update User Role
```
PATCH /api/admin/users/:id/role
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Body:** `{ "role": "admin" }` or `{ "role": "visitor" }`

### Analytics
```
GET /api/admin/analytics
Authorization: Bearer <admin-token>
```

---

## Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Full status (version, uptime, memory, DB) |
| `GET /api/health/live` | Liveness probe |
| `GET /api/health/ready` | Readiness probe (checks DB) |

---

## Error Responses

All errors return:
```json
{ "error": "Description of what went wrong" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request / validation error |
| `401` | Unauthorized (missing/invalid token) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Endpoint or resource not found |
| `429` | Rate limited (100 req / 15 min) |
| `500` | Internal server error |
