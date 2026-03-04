/**
 * Test Setup & Helpers
 * Shared utilities for all WalkNav test suites.
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'walknav-dev-jwt-secret';

/**
 * Create a test user directly in the DB and return { user, token }.
 */
async function createTestUser(db, overrides = {}) {
    const email = overrides.email || `test-${Date.now()}@test.com`;
    const password = overrides.password || 'TestPass123';
    const name = overrides.name || 'Test User';
    const role = overrides.role || 'visitor';

    const passwordHash = await bcrypt.hash(password, 4); // Low rounds for speed
    const result = await db.query(
        'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
        [email, passwordHash, name, role]
    );

    const user = result.rows[0];
    const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    return { user, token, password };
}

/**
 * Generate a JWT token for testing.
 */
function generateTestToken(payload, options = {}) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', ...options });
}

/**
 * Generate an expired JWT token.
 */
function generateExpiredToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
}

/**
 * Clean up test users from the DB.
 */
async function cleanupTestUsers(db) {
    await db.query("DELETE FROM users WHERE email LIKE 'test-%@test.com'");
}

/**
 * Clean up test route history from the DB.
 */
async function cleanupTestRoutes(db) {
    await db.query("DELETE FROM route_history WHERE start_node LIKE 'test-%'");
}

module.exports = {
    createTestUser,
    generateTestToken,
    generateExpiredToken,
    cleanupTestUsers,
    cleanupTestRoutes,
};
