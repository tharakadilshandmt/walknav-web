/**
 * Integration Tests — Zones API
 * Tests /api/zones endpoints.
 */

const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/db');

describe('Zones API', () => {
    afterAll(async () => {
        // Pool closed by global-teardown.js
    });

    // ==========================================
    // GET /api/zones
    // ==========================================
    describe('GET /api/zones', () => {
        test('returns zones array', async () => {
            const res = await request(app).get('/api/zones');
            expect(res.status).toBe(200);
            expect(res.body.zones).toBeInstanceOf(Array);
        });

        test('zone objects have expected fields', async () => {
            const res = await request(app).get('/api/zones');
            if (res.body.zones.length > 0) {
                const zone = res.body.zones[0];
                expect(zone).toHaveProperty('id');
                expect(zone).toHaveProperty('name');
                expect(zone).toHaveProperty('bounds');
            }
        });
    });

    // ==========================================
    // GET /api/zones/:id/stats
    // ==========================================
    describe('GET /api/zones/:id/stats', () => {
        test('returns stats for valid zone ID', async () => {
            const res = await request(app).get('/api/zones/1/stats');
            expect(res.status).toBe(200);
            expect(res.body.zoneId).toBe(1);
        });

        test('rejects string ID', async () => {
            const res = await request(app).get('/api/zones/abc/stats');
            expect(res.status).toBe(400);
        });

        test('rejects negative ID', async () => {
            const res = await request(app).get('/api/zones/-1/stats');
            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // GET /api/zones/:id/qr
    // ==========================================
    describe('GET /api/zones/:id/qr', () => {
        test('returns QR data for valid zone', async () => {
            const res = await request(app).get('/api/zones/1/qr');
            expect(res.status).toBe(200);
            expect(res.body.qrDataUrl).toBeDefined();
            expect(res.body.qrDataUrl).toContain('data:image/png');
            expect(res.body.zoneUrl).toBeDefined();
        });

        test('returns 404 for non-existent zone', async () => {
            const res = await request(app).get('/api/zones/9999/qr');
            expect(res.status).toBe(404);
        });

        test('rejects invalid ID parameter', async () => {
            const res = await request(app).get('/api/zones/abc/qr');
            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // GET /api/zones/:id/graph
    // ==========================================
    describe('GET /api/zones/:id/graph', () => {
        test('returns GeoJSON for valid zone', async () => {
            const res = await request(app).get('/api/zones/1/graph');
            expect(res.status).toBe(200);
            expect(res.body.type).toBe('FeatureCollection');
        });
    });
});
