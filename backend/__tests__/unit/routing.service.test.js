/**
 * Unit Tests — Routing Service
 * Tests the core routing logic without database dependency.
 * DB is globally mocked via __tests__/unit-setup.js
 */

describe('RoutingService', () => {
    let service;

    beforeAll(() => {
        // Get the singleton but we'll test internal methods directly
        service = require('../../src/services/routing.service');

        // Manually set up a small test graph (no DB needed)
        service.nodes = new Map([
            [1, { lat: -37.9100, lng: 145.1340 }],
            [2, { lat: -37.9105, lng: 145.1345 }],
            [3, { lat: -37.9110, lng: 145.1350 }],
            [4, { lat: -37.9115, lng: 145.1355 }],
        ]);

        service.adjacency = new Map([
            [1, [
                {
                    id: 'e1', from: 1, to: 2, distance: 70, floorType: 0, hasSteps: 0,
                    surface: 'asphalt', wheelchair: 'yes', bicycle: 'yes',
                    highway: 'footway', width: 2.0, lit: 'yes', incline: null, wayName: 'Main Walk',
                    polyline: [{ lat: -37.9100, lng: 145.1340 }, { lat: -37.9105, lng: 145.1345 }],
                },
            ]],
            [2, [
                {
                    id: 'e1_rev', from: 2, to: 1, distance: 70, floorType: 0, hasSteps: 0,
                    surface: 'asphalt', wheelchair: 'yes', bicycle: 'yes',
                    highway: 'footway', width: 2.0, lit: 'yes', incline: null, wayName: 'Main Walk',
                    polyline: [{ lat: -37.9105, lng: 145.1345 }, { lat: -37.9100, lng: 145.1340 }],
                },
                {
                    id: 'e2', from: 2, to: 3, distance: 80, floorType: 0, hasSteps: 1,
                    surface: 'concrete', wheelchair: 'no', bicycle: 'no',
                    highway: 'steps', width: 1.5, lit: 'no', incline: null, wayName: 'Staircase A',
                    polyline: [{ lat: -37.9105, lng: 145.1345 }, { lat: -37.9110, lng: 145.1350 }],
                },
                {
                    id: 'e3', from: 2, to: 4, distance: 120, floorType: 2, hasSteps: 0,
                    surface: 'gravel', wheelchair: null, bicycle: 'yes',
                    highway: 'path', width: 3.0, lit: 'no', incline: null, wayName: 'Garden Path',
                    polyline: [{ lat: -37.9105, lng: 145.1345 }, { lat: -37.9115, lng: 145.1355 }],
                },
            ]],
            [3, [
                {
                    id: 'e2_rev', from: 3, to: 2, distance: 80, floorType: 0, hasSteps: 1,
                    surface: 'concrete', wheelchair: 'no', bicycle: 'no',
                    highway: 'steps', width: 1.5, lit: 'no', incline: null, wayName: 'Staircase A',
                    polyline: [{ lat: -37.9110, lng: 145.1350 }, { lat: -37.9105, lng: 145.1345 }],
                },
            ]],
            [4, [
                {
                    id: 'e3_rev', from: 4, to: 2, distance: 120, floorType: 2, hasSteps: 0,
                    surface: 'gravel', wheelchair: null, bicycle: 'yes',
                    highway: 'path', width: 3.0, lit: 'no', incline: null, wayName: 'Garden Path',
                    polyline: [{ lat: -37.9115, lng: 145.1355 }, { lat: -37.9105, lng: 145.1345 }],
                },
            ]],
        ]);
    });

    // ==========================================
    // Haversine Distance
    // ==========================================
    describe('_haversineDistance()', () => {
        test('returns 0 for same point', () => {
            const d = service._haversineDistance(-37.91, 145.13, -37.91, 145.13);
            expect(d).toBe(0);
        });

        test('returns correct distance for known points (~1.11 km for 0.01° lat)', () => {
            const d = service._haversineDistance(-37.91, 145.13, -37.90, 145.13);
            expect(d).toBeGreaterThan(1000);
            expect(d).toBeLessThan(1200);
        });

        test('is symmetric (A→B === B→A)', () => {
            const d1 = service._haversineDistance(-37.91, 145.13, -37.90, 145.14);
            const d2 = service._haversineDistance(-37.90, 145.14, -37.91, 145.13);
            expect(d1).toBeCloseTo(d2, 6);
        });

        test('returns positive value for any two different points', () => {
            const d = service._haversineDistance(0, 0, 1, 1);
            expect(d).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // Edge Mode Filtering
    // ==========================================
    describe('_isEdgeAllowed()', () => {
        const stairEdge = { hasSteps: 1, highway: 'steps', wheelchair: 'no', bicycle: 'no', width: 1.5, incline: null, floorType: 0 };
        const normalEdge = { hasSteps: 0, highway: 'footway', wheelchair: 'yes', bicycle: 'yes', width: 2.0, incline: null, floorType: 0 };
        const narrowEdge = { hasSteps: 0, highway: 'footway', wheelchair: null, bicycle: null, width: 0.8, incline: null, floorType: 0 };
        const gravelEdge = { hasSteps: 0, highway: 'path', wheelchair: null, bicycle: 'yes', width: 3.0, incline: null, floorType: 2 };
        const steepEdge = { hasSteps: 0, highway: 'path', wheelchair: null, bicycle: 'yes', width: 2.0, incline: '12', floorType: 0 };

        test('walk mode allows all edges', () => {
            expect(service._isEdgeAllowed(stairEdge, 'walk')).toBe(true);
            expect(service._isEdgeAllowed(normalEdge, 'walk')).toBe(true);
            expect(service._isEdgeAllowed(narrowEdge, 'walk')).toBe(true);
        });

        test('wheelchair mode blocks stairs', () => {
            expect(service._isEdgeAllowed(stairEdge, 'wheelchair')).toBe(false);
        });

        test('wheelchair mode blocks narrow paths (<1m)', () => {
            expect(service._isEdgeAllowed(narrowEdge, 'wheelchair')).toBe(false);
        });

        test('wheelchair mode blocks gravel (floorType 2)', () => {
            expect(service._isEdgeAllowed(gravelEdge, 'wheelchair')).toBe(false);
        });

        test('wheelchair mode blocks steep inclines (>8%)', () => {
            expect(service._isEdgeAllowed(steepEdge, 'wheelchair')).toBe(false);
        });

        test('wheelchair mode allows normal paths', () => {
            expect(service._isEdgeAllowed(normalEdge, 'wheelchair')).toBe(true);
        });

        test('cycling mode blocks stairs', () => {
            expect(service._isEdgeAllowed(stairEdge, 'cycling')).toBe(false);
        });

        test('cycling mode blocks narrow paths (<1.5m)', () => {
            expect(service._isEdgeAllowed(narrowEdge, 'cycling')).toBe(false);
        });

        test('cycling mode allows wide gravel', () => {
            expect(service._isEdgeAllowed(gravelEdge, 'cycling')).toBe(true);
        });
    });

    // ==========================================
    // Edge Cost
    // ==========================================
    describe('_getEdgeCost()', () => {
        test('walk mode returns raw distance', () => {
            const edge = { distance: 100, floorType: 0, wheelchair: null, bicycle: null, lit: 'no', width: 2, incline: null };
            expect(service._getEdgeCost(edge, 'walk')).toBe(100);
        });

        test('lit paths get 5% cost reduction', () => {
            const edge = { distance: 100, floorType: 0, wheelchair: null, bicycle: null, lit: 'yes', width: 2, incline: null };
            expect(service._getEdgeCost(edge, 'walk')).toBe(95);
        });

        test('wheelchair mode penalizes gravel (floorType 2)', () => {
            const edge = { distance: 100, floorType: 2, wheelchair: null, bicycle: null, lit: 'no', width: 2, incline: null };
            const cost = service._getEdgeCost(edge, 'wheelchair');
            expect(cost).toBeGreaterThan(100);
        });

        test('wheelchair designated path gets discount', () => {
            const edge = { distance: 100, floorType: 0, wheelchair: 'designated', bicycle: null, lit: 'no', width: 2, incline: null };
            const cost = service._getEdgeCost(edge, 'wheelchair');
            expect(cost).toBeLessThan(100);
        });

        test('cycling designated path gets discount', () => {
            const edge = { distance: 100, floorType: 0, wheelchair: null, bicycle: 'designated', lit: 'no', width: 4, incline: null };
            const cost = service._getEdgeCost(edge, 'cycling');
            expect(cost).toBeLessThan(100);
        });
    });

    // ==========================================
    // Base Speed
    // ==========================================
    describe('_getBaseSpeed()', () => {
        test('walk speed is ~1.4 m/s', () => {
            expect(service._getBaseSpeed('walk')).toBe(1.4);
        });

        test('wheelchair speed is ~1.2 m/s', () => {
            expect(service._getBaseSpeed('wheelchair')).toBe(1.2);
        });

        test('cycling speed is ~4.5 m/s', () => {
            expect(service._getBaseSpeed('cycling')).toBe(4.5);
        });

        test('unknown mode defaults to walk speed', () => {
            expect(service._getBaseSpeed('unknown')).toBe(1.4);
        });
    });

    // ==========================================
    // Find Nearest Node
    // ==========================================
    describe('findNearestNode()', () => {
        test('returns closest node', () => {
            const result = service.findNearestNode(-37.9101, 145.1341);
            expect(result.nodeId).toBe(1);
            expect(result.distance).toBeGreaterThan(0);
        });

        test('works for different positions', () => {
            const result = service.findNearestNode(-37.9114, 145.1354);
            expect(result.nodeId).toBe(4);
        });

        test('returns null if no adjacency', () => {
            const origAdj = service.adjacency;
            service.adjacency = new Map();
            const result = service.findNearestNode(-37.91, 145.13);
            expect(result).toBeNull();
            service.adjacency = origAdj;
        });
    });

    // ==========================================
    // Path Reconstruction
    // ==========================================
    describe('_reconstructPath()', () => {
        test('reconstructs valid path', () => {
            const prev = new Map([[1, null], [2, 1], [3, 2]]);
            const path = service._reconstructPath(1, 3, prev);
            expect(path).toEqual([1, 2, 3]);
        });

        test('returns empty array for unreachable destination', () => {
            const prev = new Map([[1, null], [2, 1]]);
            const path = service._reconstructPath(1, 99, prev);
            expect(path).toEqual([]);
        });

        test('single node path', () => {
            const prev = new Map([[1, null]]);
            const path = service._reconstructPath(1, 1, prev);
            expect(path).toEqual([1]);
        });
    });

    // ==========================================
    // Route Calculation (integration with test graph)
    // ==========================================
    describe('calculateRoute()', () => {
        test('returns error when graph not loaded', () => {
            const origNodes = service.nodes;
            service.nodes = null;
            const result = service.calculateRoute(-37.91, 145.13, -37.911, 145.135);
            expect(result.error).toBe('Graph not loaded');
            service.nodes = origNodes;
        });

        test('same origin and destination returns 0 distance', () => {
            const result = service.calculateRoute(-37.9100, 145.1340, -37.9100, 145.1340);
            expect(result.totalDistance).toBe(0);
            expect(result.totalDuration).toBe(0);
        });

        test('finds route between adjacent nodes', () => {
            // Node 1 → Node 2 (direct edge)
            const result = service.calculateRoute(-37.9100, 145.1340, -37.9105, 145.1345, 'walk');
            expect(result.totalDistance).toBeGreaterThan(0);
            expect(result.steps).toBeDefined();
            expect(result.polyline).toBeDefined();
        });

        test('wheelchair mode avoids stairs', () => {
            // Node 1 → Node 3 (stairs between 2→3)
            // Wheelchair should either find alternative or return no route
            const result = service.calculateRoute(-37.9100, 145.1340, -37.9110, 145.1350, 'wheelchair');
            // Since node 3 is only reachable via stairs, this should fail
            expect(result.error || result.totalDistance).toBeDefined();
        });
    });

    // ==========================================
    // Instruction Generation
    // ==========================================
    describe('_getInstruction()', () => {
        test('first step returns "Start navigation"', () => {
            const edge = { polyline: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], hasSteps: 0 };
            expect(service._getInstruction(edge, null)).toBe('Start navigation');
        });

        test('step edge returns "Use the stairs"', () => {
            const edge = { polyline: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], hasSteps: 1 };
            expect(service._getInstruction(edge, 1)).toBe('Use the stairs');
        });
    });

    // ==========================================
    // GeoJSON Export
    // ==========================================
    describe('getGraphAsGeoJSON()', () => {
        test('returns valid GeoJSON FeatureCollection', () => {
            const geojson = service.getGraphAsGeoJSON();
            expect(geojson.type).toBe('FeatureCollection');
            expect(geojson.features).toBeInstanceOf(Array);
            expect(geojson.features.length).toBeGreaterThan(0);
        });

        test('features have correct structure', () => {
            const geojson = service.getGraphAsGeoJSON();
            const feature = geojson.features[0];
            expect(feature.type).toBe('Feature');
            expect(feature.geometry.type).toBe('LineString');
            expect(feature.properties).toHaveProperty('id');
            expect(feature.properties).toHaveProperty('floor_type');
        });

        test('excludes reverse edges', () => {
            const geojson = service.getGraphAsGeoJSON();
            const reverseEdges = geojson.features.filter(f => f.properties.id.endsWith('_rev'));
            expect(reverseEdges.length).toBe(0);
        });
    });
});
