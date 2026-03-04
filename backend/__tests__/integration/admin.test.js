/**
 * Integration Tests — Admin API
 * Tests /api/admin endpoints (auth + admin role required).
 */

const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/db');
const { createTestUser, cleanupTestUsers } = require('../setup');

describe('Admin API', () => {
    let adminToken;
    let visitorToken;
    let visitorUserId;

    beforeAll(async () => {
        const admin = await createTestUser(db, { role: 'admin' });
        adminToken = admin.token;

        const visitor = await createTestUser(db);
        visitorToken = visitor.token;
        visitorUserId = visitor.user.id;
    });

    afterAll(async () => {
        await cleanupTestUsers(db);
    });

    // ==========================================
    // Access Control
    // ==========================================
    describe('Access Control', () => {
        test('rejects unauthenticated requests', async () => {
            const res = await request(app).get('/api/admin/stats');
            expect(res.status).toBe(401);
        });

        test('rejects non-admin users', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${visitorToken}`);

            expect(res.status).toBe(403);
        });

        test('allows admin users', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
        });
    });

    // ==========================================
    // GET /api/admin/stats
    // ==========================================
    describe('GET /api/admin/stats', () => {
        test('returns system statistics', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.users).toBeDefined();
            expect(res.body.users.total).toBeGreaterThanOrEqual(1);
            expect(res.body.routes).toBeDefined();
            expect(res.body.network).toBeDefined();
        });

        test('includes no-cache headers', async () => {
            const res = await request(app)
                .get('/api/admin/stats')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.headers['cache-control']).toContain('no-store');
        });
    });

    // ==========================================
    // GET /api/admin/users
    // ==========================================
    describe('GET /api/admin/users', () => {
        test('returns paginated users list', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.users).toBeInstanceOf(Array);
            expect(res.body.total).toBeGreaterThanOrEqual(1);
            expect(res.body.limit).toBeDefined();
            expect(res.body.offset).toBeDefined();
        });

        test('respects pagination parameters', async () => {
            const res = await request(app)
                .get('/api/admin/users?limit=5&offset=0')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.limit).toBe(5);
            expect(res.body.offset).toBe(0);
        });

        test('user objects have expected fields', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            const user = res.body.users[0];
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('email');
            expect(user).toHaveProperty('name');
            expect(user).toHaveProperty('role');
            expect(user).not.toHaveProperty('password_hash'); // Must not leak
        });
    });

    // ==========================================
    // PATCH /api/admin/users/:id/role
    // ==========================================
    describe('PATCH /api/admin/users/:id/role', () => {
        test('promotes visitor to admin', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${visitorUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'admin' });

            expect(res.status).toBe(200);
            expect(res.body.user.role).toBe('admin');

            // Restore to visitor
            await request(app)
                .patch(`/api/admin/users/${visitorUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'visitor' });
        });

        test('rejects invalid role', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${visitorUserId}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'superadmin' });

            expect(res.status).toBe(400);
        });

        test('rejects invalid user ID', async () => {
            const res = await request(app)
                .patch('/api/admin/users/abc/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'admin' });

            expect(res.status).toBe(400);
        });

        test('returns 404 for non-existent user', async () => {
            const res = await request(app)
                .patch('/api/admin/users/999999/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'admin' });

            expect(res.status).toBe(404);
        });
    });

    // ==========================================
    // GET /api/admin/analytics
    // ==========================================
    describe('GET /api/admin/analytics', () => {
        test('returns analytics data', async () => {
            const res = await request(app)
                .get('/api/admin/analytics')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.routesPerDay).toBeInstanceOf(Array);
            expect(res.body.modeBreakdown).toBeInstanceOf(Array);
            expect(res.body.peakHours).toBeInstanceOf(Array);
            expect(res.body.recentRoutes).toBeInstanceOf(Array);
        });
    });
});
