/**
 * Integration Tests — Auth API
 * Tests /api/auth endpoints with real Express app and DB.
 */

const request = require('supertest');
const app = require('../../src/server');
const db = require('../../src/config/db');
const { createTestUser, cleanupTestUsers } = require('../setup');

describe('Auth API', () => {
    afterAll(async () => {
        await cleanupTestUsers(db);
    });

    // ==========================================
    // POST /api/auth/register
    // ==========================================
    describe('POST /api/auth/register', () => {
        const uniqueEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;

        test('registers a new user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: uniqueEmail(), password: 'TestPass1', name: 'New User' });

            expect(res.status).toBe(201);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.email).toBeDefined();
            expect(res.body.user.role).toBe('visitor');
        });

        test('rejects duplicate email', async () => {
            const email = uniqueEmail();
            await request(app)
                .post('/api/auth/register')
                .send({ email, password: 'TestPass1', name: 'First' });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email, password: 'TestPass1', name: 'Second' });

            expect(res.status).toBe(409);
        });

        test('rejects weak password (no uppercase)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: uniqueEmail(), password: 'weakpass1', name: 'User' });

            expect(res.status).toBe(400);
        });

        test('rejects weak password (no digit)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: uniqueEmail(), password: 'WeakPasss', name: 'User' });

            expect(res.status).toBe(400);
        });

        test('rejects short password (<8 chars)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: uniqueEmail(), password: 'Ab1', name: 'User' });

            expect(res.status).toBe(400);
        });

        test('rejects missing name', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: uniqueEmail(), password: 'TestPass1' });

            expect(res.status).toBe(400);
        });

        test('rejects invalid email', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'notanemail', password: 'TestPass1', name: 'User' });

            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // POST /api/auth/login
    // ==========================================
    describe('POST /api/auth/login', () => {
        let testEmail;
        const testPassword = 'TestPass1';

        beforeAll(async () => {
            const { user } = await createTestUser(db, { password: testPassword });
            testEmail = user.email;
        });

        test('logs in with valid credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: testEmail, password: testPassword });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.email).toBe(testEmail);
        });

        test('rejects wrong password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: testEmail, password: 'WrongPass1' });

            expect(res.status).toBe(401);
        });

        test('rejects non-existent email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nobody@nowhere.com', password: 'TestPass1' });

            expect(res.status).toBe(401);
        });

        test('rejects missing password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: testEmail });

            expect(res.status).toBe(400);
        });
    });

    // ==========================================
    // GET /api/auth/me
    // ==========================================
    describe('GET /api/auth/me', () => {
        test('returns user profile with valid token', async () => {
            const { token } = await createTestUser(db);
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.user).toBeDefined();
            expect(res.body.user.email).toBeDefined();
        });

        test('rejects request without token', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });

        test('rejects request with invalid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid.token.here');

            expect(res.status).toBe(401);
        });
    });
});
