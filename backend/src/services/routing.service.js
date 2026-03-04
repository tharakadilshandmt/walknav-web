/**
 * WalkNav Routing Service
 * 
 * Server-side Dijkstra/A* routing engine with multi-modal support.
 * Ported from the Flutter mobile app's NavigationService.
 * 
 * Modes:
 *   - walk: all edges allowed
 *   - wheelchair: avoid stairs (has_steps=1)
 *   - cycling: avoid stairs (has_steps=1)
 */

const db = require('../config/db');

class RoutingService {
    /**
     * Load the routing graph from the database into memory
     * Called once at startup and cached for performance
     */
    async loadGraph() {
        console.log('📡 Loading routing graph from database...');
        const startTime = Date.now();

        // Load nodes
        const nodesResult = await db.query(
            'SELECT id, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM nodes'
        );

        // Load edges
        const edgesResult = await db.query(`
      SELECT 
        id, source_node, target_node, length, floor_type, has_steps,
        surface, wheelchair, bicycle, highway, width, lit, incline, way_name, osmid,
        ST_AsGeoJSON(geom)::json AS geojson
      FROM edges
    `);

        // Build graph structures
        this.nodes = new Map();
        this.adjacency = new Map();

        for (const node of nodesResult.rows) {
            this.nodes.set(node.id, { lat: parseFloat(node.lat), lng: parseFloat(node.lng) });
        }

        for (const edge of edgesResult.rows) {
            const edgeObj = {
                id: edge.id,
                from: edge.source_node,
                to: edge.target_node,
                distance: parseFloat(edge.length),
                floorType: edge.floor_type,
                hasSteps: edge.has_steps,
                surface: edge.surface,
                wheelchair: edge.wheelchair,
                bicycle: edge.bicycle,
                highway: edge.highway,
                width: edge.width ? parseFloat(edge.width) : null,
                lit: edge.lit,
                incline: edge.incline,
                wayName: edge.way_name,
                polyline: edge.geojson.coordinates.map(([lng, lat]) => ({ lat, lng })),
            };

            // Add forward direction
            if (!this.adjacency.has(edge.source_node)) {
                this.adjacency.set(edge.source_node, []);
            }
            this.adjacency.get(edge.source_node).push(edgeObj);

            // Add reverse direction (bidirectional edges)
            const reverseEdge = {
                ...edgeObj,
                id: `${edge.id}_rev`,
                from: edge.target_node,
                to: edge.source_node,
                polyline: [...edgeObj.polyline].reverse(),
            };
            if (!this.adjacency.has(edge.target_node)) {
                this.adjacency.set(edge.target_node, []);
            }
            this.adjacency.get(edge.target_node).push(reverseEdge);
        }

        // Build a set of connected nodes (those that appear in edges)
        this.connectedNodes = new Set();

        const elapsed = Date.now() - startTime;
        console.log(`✅ Graph loaded: ${this.nodes.size} nodes, ${edgesResult.rows.length} edges, ${this.adjacency.size} connected nodes (${elapsed}ms)`);

        return { nodes: this.nodes.size, edges: edgesResult.rows.length, connected: this.adjacency.size };
    }

    /**
     * Find the nearest graph node to a given position
     */
    findNearestNode(lat, lng) {
        if (!this.adjacency || this.adjacency.size === 0) return null;

        let minDist = Infinity;
        let nearest = null;

        // Only search nodes that have edges (connected nodes)
        for (const [id] of this.adjacency) {
            const node = this.nodes.get(id);
            if (!node) continue;
            const dist = this._haversineDistance(lat, lng, node.lat, node.lng);
            if (dist < minDist) {
                minDist = dist;
                nearest = id;
            }
        }

        return { nodeId: nearest, distance: minDist };
    }

    /**
     * Calculate a route between two points using Dijkstra's algorithm
     */
    calculateRoute(originLat, originLng, destLat, destLng, mode = 'walk') {
        if (!this.nodes || this.nodes.size === 0) {
            return { error: 'Graph not loaded' };
        }

        // Find nearest nodes to origin and destination
        const startResult = this.findNearestNode(originLat, originLng);
        const endResult = this.findNearestNode(destLat, destLng);

        if (!startResult.nodeId || !endResult.nodeId) {
            return { error: 'Could not find nearby nodes' };
        }

        const startId = startResult.nodeId;
        const endId = endResult.nodeId;

        // Check if same node
        if (startId === endId) {
            return {
                steps: [],
                totalDistance: 0,
                totalDuration: 0,
                polyline: [],
                message: 'Origin and destination are the same location',
            };
        }

        // Run Dijkstra
        const dijkstraResult = this._runDijkstra(startId, endId, mode);

        // Reconstruct path
        const path = this._reconstructPath(startId, endId, dijkstraResult.prev);

        if (path.length === 0) {
            return { error: `No ${mode} route found between these points` };
        }

        // Build step results
        return this._buildResult(path, mode);
    }

    /**
     * Dijkstra's algorithm with multi-modal edge filtering
     */
    _runDijkstra(startId, endId, mode) {
        const distances = new Map();
        const prev = new Map();
        // Only use connected nodes for Dijkstra (much faster)
        const unvisited = new Set(this.adjacency.keys());

        // Initialize
        for (const id of this.adjacency.keys()) {
            distances.set(id, Infinity);
            prev.set(id, null);
        }
        distances.set(startId, 0);

        while (unvisited.size > 0) {
            // Find unvisited node with minimum distance
            let u = null;
            let minDist = Infinity;
            for (const id of unvisited) {
                const d = distances.get(id);
                if (d < minDist) {
                    minDist = d;
                    u = id;
                }
            }

            if (u === null || minDist === Infinity) break;
            if (u === endId) break;

            unvisited.delete(u);

            // Relax neighbors
            const neighbors = this.adjacency.get(u) || [];
            for (const edge of neighbors) {
                if (!unvisited.has(edge.to)) continue;

                // Mode filtering
                if (!this._isEdgeAllowed(edge, mode)) continue;

                // Cost calculation (can be extended with terrain weights)
                const cost = this._getEdgeCost(edge, mode);
                const alt = distances.get(u) + cost;

                if (alt < distances.get(edge.to)) {
                    distances.set(edge.to, alt);
                    prev.set(edge.to, u);
                }
            }
        }

        return { distances, prev };
    }

    /**
     * Check if an edge is allowed for the given travel mode
     */
    _isEdgeAllowed(edge, mode) {
        if (mode === 'walk') return true;

        if (mode === 'wheelchair') {
            // Avoid stairs
            if (edge.hasSteps === 1 || edge.highway === 'steps') return false;
            // Avoid if explicitly not wheelchair accessible
            if (edge.wheelchair === 'no') return false;
            // Avoid narrow paths (< 1m width)
            if (edge.width && edge.width < 1.0) return false;
            // Avoid steep inclines
            if (edge.incline && (edge.incline.includes('steep') || parseFloat(edge.incline) > 8)) return false;
            // Avoid rough terrain (sand, gravel)
            if (edge.floorType === 2) return false;
            return true;
        }

        if (mode === 'cycling') {
            // Avoid stairs
            if (edge.hasSteps === 1 || edge.highway === 'steps') return false;
            // Avoid if explicitly no bicycle
            if (edge.bicycle === 'no' || edge.bicycle === 'dismount') return false;
            // Avoid narrow paths (< 1.5m)
            if (edge.width && edge.width < 1.5) return false;
            return true;
        }

        return true;
    }

    /**
     * Get the cost of traversing an edge (can include terrain weighting)
     */
    _getEdgeCost(edge, mode) {
        let cost = edge.distance;

        if (mode === 'wheelchair') {
            // Penalize rough surfaces
            if (edge.floorType === 2) cost *= 2.0;   // Sand/gravel — very hard
            if (edge.floorType === 3) cost *= 1.5;   // Wood — bumpy joins
            if (edge.floorType === 4) cost *= 1.2;   // Synthetic — slightly slower
            // Prefer wheelchair-designated paths
            if (edge.wheelchair === 'designated') cost *= 0.7;
            if (edge.wheelchair === 'yes') cost *= 0.85;
            // Penalize narrow paths
            if (edge.width && edge.width < 1.5) cost *= 1.5;
            // Penalize inclines
            if (edge.incline) {
                const pct = parseFloat(edge.incline);
                if (!isNaN(pct) && pct > 3) cost *= (1 + pct / 10);
            }
        }

        if (mode === 'cycling') {
            // Prefer cycling-designated paths
            if (edge.bicycle === 'designated') cost *= 0.6;
            if (edge.bicycle === 'yes') cost *= 0.8;
            // Penalize rough terrain
            if (edge.floorType === 2) cost *= 1.5;   // Sand
            if (edge.floorType === 3) cost *= 1.8;   // Wood
            // Prefer wider paths
            if (edge.width && edge.width >= 3.0) cost *= 0.8;
        }

        // Prefer lit paths for all modes (slight preference)
        if (edge.lit === 'yes') cost *= 0.95;

        return cost;
    }

    /**
     * Reconstruct path from Dijkstra's previous-node map
     */
    _reconstructPath(startId, endId, prev) {
        const path = [];
        let current = endId;

        while (current !== null) {
            path.unshift(current);
            current = prev.get(current);
        }

        if (path.length === 0 || path[0] !== startId) {
            return []; // No path found
        }

        return path;
    }

    /**
     * Build navigation result from a path of node IDs
     */
    _buildResult(path, mode) {
        const steps = [];
        let totalDistance = 0;
        const allPolylinePoints = [];

        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];

            const edges = this.adjacency.get(from) || [];
            const edge = edges.find(e => e.to === to);

            if (edge) {
                totalDistance += edge.distance;

                // Generate instruction
                const instruction = this._getInstruction(edge, i > 0 ? path[i - 1] : null);

                steps.push({
                    instruction,
                    distance: Math.round(edge.distance * 10) / 10,
                    floorType: edge.floorType,
                    hasSteps: edge.hasSteps,
                    points: edge.polyline,
                });

                // Collect all polyline points
                allPolylinePoints.push(...edge.polyline);
            }
        }

        // Calculate duration based on mode speed
        const speed = this._getBaseSpeed(mode);
        const totalDuration = totalDistance / speed;

        return {
            steps,
            totalDistance: Math.round(totalDistance * 10) / 10,
            totalDuration: Math.round(totalDuration),
            polyline: allPolylinePoints,
            mode,
        };
    }

    /**
     * Generate turn-by-turn instruction for an edge
     */
    _getInstruction(edge, prevNodeId) {
        if (!prevNodeId) return 'Start navigation';

        if (edge.hasSteps === 1) return 'Use the stairs';

        const start = edge.polyline[0];
        const end = edge.polyline[edge.polyline.length - 1];
        const prevNode = this.nodes.get(prevNodeId);

        if (!prevNode || !start || !end) return 'Continue';

        // Calculate turn angle
        const prevVector = { x: start.lat - prevNode.lat, y: start.lng - prevNode.lng };
        const currVector = { x: end.lat - start.lat, y: end.lng - start.lng };

        const dot = prevVector.x * currVector.x + prevVector.y * currVector.y;
        const det = prevVector.x * currVector.y - prevVector.y * currVector.x;
        const angle = Math.atan2(det, dot) * (180 / Math.PI);

        if (Math.abs(angle) < 25) return 'Continue straight';
        if (angle > 25) return 'Turn right';
        if (angle < -25) return 'Turn left';
        return 'Continue';
    }

    /**
     * Base speed for each travel mode (meters/second)
     */
    _getBaseSpeed(mode) {
        switch (mode) {
            case 'walk': return 1.4;        // ~5 km/h
            case 'wheelchair': return 1.2;  // ~4.3 km/h
            case 'cycling': return 4.5;     // ~16 km/h
            default: return 1.4;
        }
    }

    /**
     * Haversine distance between two lat/lng points (in meters)
     */
    _haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth radius in meters
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLng = (lng2 - lng1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Snap a GPS position to the nearest edge (for route tracking)
     */
    async snapToEdge(lat, lng) {
        // Use PostGIS to find the nearest edge and project the point onto it
        const result = await db.query(`
      SELECT 
        e.id,
        e.source_node,
        e.target_node,
        e.floor_type,
        ST_Distance(e.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters,
        ST_X(ST_ClosestPoint(e.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS snapped_lng,
        ST_Y(ST_ClosestPoint(e.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))) AS snapped_lat
      FROM edges e
      ORDER BY e.geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT 1
    `, [lng, lat]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            edgeId: row.id,
            sourceNode: row.source_node,
            targetNode: row.target_node,
            floorType: row.floor_type,
            distanceFromEdge: parseFloat(row.distance_meters),
            snappedLat: parseFloat(row.snapped_lat),
            snappedLng: parseFloat(row.snapped_lng),
        };
    }

    /**
     * Get the full graph data as GeoJSON (for map rendering)
     */
    getGraphAsGeoJSON() {
        if (!this.adjacency) return { type: 'FeatureCollection', features: [] };

        const seenEdges = new Set();
        const features = [];

        for (const [, edges] of this.adjacency) {
            for (const edge of edges) {
                // Skip reverse edges
                if (edge.id.endsWith('_rev')) continue;
                if (seenEdges.has(edge.id)) continue;
                seenEdges.add(edge.id);

                features.push({
                    type: 'Feature',
                    properties: {
                        id: edge.id,
                        floor_type: edge.floorType,
                        has_steps: edge.hasSteps,
                        distance: edge.distance,
                        surface: edge.surface,
                        wheelchair: edge.wheelchair,
                        bicycle: edge.bicycle,
                        highway: edge.highway,
                        width: edge.width,
                        lit: edge.lit,
                        way_name: edge.wayName,
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: edge.polyline.map(p => [p.lng, p.lat]),
                    },
                });
            }
        }

        return { type: 'FeatureCollection', features };
    }
}

// Singleton instance
const routingService = new RoutingService();

module.exports = routingService;
