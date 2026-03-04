/**
 * Integration Tests — Weather API
 * Tests /api/weather endpoint.
 */

const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/db');

describe('Weather API', () => {
    afterAll(async () => {
        // Pool closed by global-teardown.js
    });

    describe('GET /api/weather', () => {
        test('returns weather data for valid coordinates', async () => {
            const res = await request(app)
                .get('/api/weather?lat=-37.91&lng=145.13');

            // May fail if no internet — accept 200 or 502
            expect([200, 502]).toContain(res.status);
            if (res.status === 200) {
                expect(res.body.temperature).toBeDefined();
            }
        });

        test('rejects missing lat parameter', async () => {
            const res = await request(app).get('/api/weather?lng=145.13');
            expect(res.status).toBe(400);
        });

        test('rejects missing lng parameter', async () => {
            const res = await request(app).get('/api/weather?lat=-37.91');
            expect(res.status).toBe(400);
        });

        test('rejects out-of-range latitude', async () => {
            const res = await request(app).get('/api/weather?lat=999&lng=145');
            expect(res.status).toBe(400);
        });

        test('rejects out-of-range longitude', async () => {
            const res = await request(app).get('/api/weather?lat=-37&lng=999');
            expect(res.status).toBe(400);
        });

        test('rejects non-numeric parameters', async () => {
            const res = await request(app).get('/api/weather?lat=abc&lng=def');
            expect(res.status).toBe(400);
        });
    });
});
