-- ============================================
-- WalkNav Database Schema
-- PostgreSQL 16 + PostGIS 3.4
-- ============================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- Users Table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    role            VARCHAR(20) DEFAULT 'visitor' CHECK (role IN ('visitor', 'admin')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Navigation Zones
-- ============================================
CREATE TABLE IF NOT EXISTS navigation_zones (
    zone_id         SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    geom            GEOMETRY(POLYGON, 4326),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Nodes (intersection points in the routing graph)
-- H3 hex cell IDs used as primary keys
-- ============================================
CREATE TABLE IF NOT EXISTS nodes (
    id              VARCHAR(50) PRIMARY KEY,
    zone_id         INTEGER REFERENCES navigation_zones(zone_id) ON DELETE SET NULL,
    geom            GEOMETRY(POINT, 4326) NOT NULL,
    floor           INTEGER DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Edges (path segments connecting two nodes)
-- ============================================
CREATE TABLE IF NOT EXISTS edges (
    id              VARCHAR(100) PRIMARY KEY,
    source_node     VARCHAR(50) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node     VARCHAR(50) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    geom            GEOMETRY(LINESTRING, 4326) NOT NULL,
    length          DOUBLE PRECISION NOT NULL,       -- distance in meters
    floor_type      INTEGER DEFAULT 0,               -- 0=concrete, 1=tar, 2=sand, 3=wood, 4=synthetic
    has_steps       INTEGER DEFAULT 0,               -- 0=no, 1=yes
    slope           DOUBLE PRECISION DEFAULT 0,      -- gradient in degrees
    is_bidirectional BOOLEAN DEFAULT TRUE,
    -- OSM enriched fields
    surface         VARCHAR(50),                     -- asphalt, concrete, gravel, etc.
    wheelchair      VARCHAR(20),                     -- yes, no, limited, designated
    bicycle         VARCHAR(20),                     -- yes, no, designated, dismount
    highway         VARCHAR(50),                     -- footway, pedestrian, steps, path, etc.
    width           DOUBLE PRECISION,                -- path width in meters
    lit             VARCHAR(10),                     -- yes, no
    incline         VARCHAR(20),                     -- up, down, 5%, etc.
    way_name        VARCHAR(255),                    -- street/path name
    osmid           BIGINT,                          -- OpenStreetMap way ID
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Buildings (optional — for entrance optimization)
-- ============================================
CREATE TABLE IF NOT EXISTS buildings (
    building_id     SERIAL PRIMARY KEY,
    zone_id         INTEGER REFERENCES navigation_zones(zone_id) ON DELETE SET NULL,
    name            VARCHAR(255),
    geom            GEOMETRY(POLYGON, 4326),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Entrances (optional — for entrance optimization)
-- ============================================
CREATE TABLE IF NOT EXISTS entrances (
    entrance_id     SERIAL PRIMARY KEY,
    building_id     INTEGER REFERENCES buildings(building_id) ON DELETE CASCADE,
    node_id         VARCHAR(50) REFERENCES nodes(id) ON DELETE SET NULL,
    geom            GEOMETRY(POINT, 4326),
    accessibility   BOOLEAN DEFAULT TRUE,
    floor           INTEGER DEFAULT 0,
    name            VARCHAR(255),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Route History (completed navigations)
-- ============================================
CREATE TABLE IF NOT EXISTS route_history (
    route_id        SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_node      VARCHAR(50),
    end_node        VARCHAR(50),
    path            JSONB,                            -- array of node IDs
    distance        DOUBLE PRECISION,                 -- meters
    duration        DOUBLE PRECISION,                 -- seconds
    mode            VARCHAR(20) CHECK (mode IN ('walk', 'wheelchair', 'cycling')),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Spatial Indexes (GiST) — critical for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_nodes_geom ON nodes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_edges_geom ON edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_node);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_node);
CREATE INDEX IF NOT EXISTS idx_edges_floor_type ON edges (floor_type);
CREATE INDEX IF NOT EXISTS idx_edges_has_steps ON edges (has_steps);
CREATE INDEX IF NOT EXISTS idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_entrances_geom ON entrances USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_zones_geom ON navigation_zones USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_route_history_user ON route_history (user_id);
CREATE INDEX IF NOT EXISTS idx_route_history_created ON route_history (created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ============================================
-- Insert default admin user (password: admin123)
-- bcrypt hash of 'admin123'
-- ============================================
-- Note: This will be handled by the seed script instead, 
-- so we can use proper bcrypt hashing at runtime.

-- ============================================
-- Insert default navigation zone (Monash Clayton)
-- ============================================
INSERT INTO navigation_zones (name, description, geom) VALUES (
    'Monash University Clayton',
    'Main campus of Monash University, Clayton, Melbourne, Australia',
    ST_SetSRID(ST_MakePolygon(ST_GeomFromText(
        'LINESTRING(145.125 -37.920, 145.145 -37.920, 145.145 -37.905, 145.125 -37.905, 145.125 -37.920)'
    )), 4326)
) ON CONFLICT DO NOTHING;

-- ============================================
-- Confirmation
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'WalkNav database schema created successfully!';
    RAISE NOTICE 'Tables: users, navigation_zones, nodes, edges, buildings, entrances, route_history';
    RAISE NOTICE 'Spatial indexes created on all geometry columns';
END $$;
