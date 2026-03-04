/**
 * Integration Tests — Routes API
 * Tests /api/routes endpoints.
 */

const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/db');
const { createTestUser, cleanupTestUsers, cleanupTestRoutes } = require('../setup');

describe('Routes API', () => {
    let authToken;

    beforeAll(async () => {
        const { token } = await createTestUser(db);
        authToken = token;

        // Load routing graph (skipped in test mode by server.js)
        try {
            const routingService = require('../../src/services/routing.service');
            await routingService.loadGraph();
        } catch {
            console.warn('Could not load routing graph for tests');
        }
    });

    afterAll(async () => {
        await cleanupTestUsers(db);
        await cleanupTestRoutes(db);
    });

    // ==========================================
    // GET /api/routes/graph
    // ==========================================
    describe('GET /api/routes/graph', () => {
        test('returns GeoJSON FeatureCollection', async () => {
            const res = await request(app).get('/api/routes/graph');
            expect(res.status).toBe(200);
            expect(res.body.type).toBe('FeatureCollection');
            expect(res.body.features).toBeInstanceOf(Array);
        });
    });

    // ==========================================
    // POST /api/routes/calculate
    // ==========================================
    describe('POST /api/routes/calculate', () => {
        test('calculates route with valid coordinates', async () => {
            const res = await request(app)
                .post('/api/routes/calculate')
                .send({
                    origin: { lat: -37.9105, lng: 145.1340 },
                    destination: { lat: -37.9120, lng: 145.1360 },
                    mode: 'walk',
                });

            expect(res.status).toBe(200);
            expect(res.body.totalDistance).toBeDefined();
            expect(res.body.steps).toBeInstanceOf(Array);
        });

        test('rejects invalid latitude (>90)', async () => {
            const res = await request(app)
                .post('/api/routes/calculate')
                .send({
                    origin: { lat: 999, lng: 145.13 },
                    destination: { lat: -37.91, lng: 145.14 },
                });

            expect(res.status).toBe(400);
        });

        test('rejects invalid longitude (>180)', async () => {
            const res = await request(app)
                .post('/api/routes/calculate')
                .send({
                    origin: { lat: -37.91, lng: 999 },
                    destination: { lat: -37.91, lng: 145.14 },
                });

            expect(res.status).toBe(400);
        });

        test('rejects invalid mode', async () => {
            const res = await request(app)
                .post('/api/routes/calculate')
                .send({
                    origin: { lat: -37.91, lng: 145.13 },
                    destination: { lat: -37.91, lng: 145.14 },
                    mode: 'flying',
                });

            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // POST /api/routes/snap
    // ==========================================
    describe('POST /api/routes/snap', () => {
        test('snaps valid coordinates', async () => {
            const res = await request(app)
                .post('/api/routes/snap')
                .send({ lat: -37.9105, lng: 145.1340 });

            expect(res.status).toBe(200);
            expect(res.body.snappedLat).toBeDefined();
            expect(res.body.snappedLng).toBeDefined();
        });

        test('rejects out-of-range coordinates', async () => {
            const res = await request(app)
                .post('/api/routes/snap')
                .send({ lat: -999, lng: 999 });

            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // POST /api/routes/history (Protected)
    // ==========================================
    describe('POST /api/routes/history', () => {
        test('saves route with valid data and auth', async () => {
            const res = await request(app)
                .post('/api/routes/history')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    startNode: 'test-node-1',
                    endNode: 'test-node-2',
                    distance: 500,
                    duration: 300,
                    mode: 'walk',
                    path: [{ lat: -37.91, lng: 145.13 }],
                });

            expect(res.status).toBe(201);
            expect(res.body.routeId).toBeDefined();
        });

        test('rejects without authentication', async () => {
            const res = await request(app)
                .post('/api/routes/history')
                .send({
                    startNode: 'test-a', endNode: 'test-b',
                    distance: 100, duration: 60, mode: 'walk',
                });

            expect(res.status).toBe(401);
        });

        test('rejects invalid mode', async () => {
            const res = await request(app)
                .post('/api/routes/history')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    startNode: 'test-a', endNode: 'test-b',
                    distance: 100, duration: 60, mode: 'flying',
                });

            expect(res.status).toBe(400);
        });

        test('rejects negative distance', async () => {
            const res = await request(app)
                .post('/api/routes/history')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    startNode: 'test-a', endNode: 'test-b',
                    distance: -100, duration: 60, mode: 'walk',
                });

            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // GET /api/routes/history (Protected)
    // ==========================================
    describe('GET /api/routes/history', () => {
        test('returns user route history', async () => {
            const res = await request(app)
                .get('/api/routes/history')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.routes).toBeInstanceOf(Array);
            expect(res.body.total).toBeDefined();
        });

        test('rejects without authentication', async () => {
            const res = await request(app).get('/api/routes/history');
            expect(res.status).toBe(401);
        });

        test('respects pagination params', async () => {
            const res = await request(app)
                .get('/api/routes/history?limit=5&offset=0')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.status).toBe(200);
            expect(res.body.limit).toBe(5);
        });
    });
});
