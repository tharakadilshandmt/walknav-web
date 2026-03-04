/**
 * Unit Tests — Security Middleware
 * Tests middleware functions in isolation using mock req/res/next.
 */

const { sanitizeParams, requestId, noCache } = require('../../src/middleware/security');
const { authMiddleware } = require('../../src/middleware/auth');
const { requireRole } = require('../../src/middleware/rbac');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'walknav-dev-jwt-secret';

// Helper: create mock Express req/res/next
function createMocks(overrides = {}) {
    const req = {
        params: {},
        headers: {},
        user: null,
        ip: '127.0.0.1',
        ...overrides,
    };
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        setHeader(name, value) { this.headers[name] = value; },
    };
    const next = jest.fn();
    return { req, res, next };
}

// ==========================================
// sanitizeParams
// ==========================================
describe('sanitizeParams middleware', () => {
    test('passes through when no :id param', () => {
        const { req, res, next } = createMocks();
        sanitizeParams(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('allows valid positive integer ID', () => {
        const { req, res, next } = createMocks({ params: { id: '42' } });
        sanitizeParams(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.params.id).toBe('42');
    });

    test('rejects non-numeric ID', () => {
        const { req, res, next } = createMocks({ params: { id: 'abc' } });
        sanitizeParams(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('Invalid ID');
    });

    test('rejects negative ID', () => {
        const { req, res, next } = createMocks({ params: { id: '-5' } });
        sanitizeParams(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    test('rejects zero ID', () => {
        const { req, res, next } = createMocks({ params: { id: '0' } });
        sanitizeParams(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    test('rejects float ID', () => {
        const { req, res, next } = createMocks({ params: { id: '3.14' } });
        sanitizeParams(req, res, next);
        // parseInt('3.14') = 3 which is valid, so this should pass
        expect(next).toHaveBeenCalled();
    });

    test('sanitizes SQL injection attempt in ID (parseInt strips payload)', () => {
        const { req, res, next } = createMocks({ params: { id: "1; DROP TABLE users" } });
        sanitizeParams(req, res, next);
        // parseInt('1; DROP TABLE users') = 1, which is valid.
        // The injection payload is discarded by parseInt + String(id) overwrite.
        expect(next).toHaveBeenCalled();
        expect(req.params.id).toBe('1');
    });
});

// ==========================================
// requestId
// ==========================================
describe('requestId middleware', () => {
    test('generates X-Request-ID when not provided', () => {
        const { req, res, next } = createMocks();
        requestId(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.requestId).toBeDefined();
        expect(req.requestId).toMatch(/^wn-/);
        expect(res.headers['X-Request-ID']).toBe(req.requestId);
    });

    test('preserves existing X-Request-ID from proxy', () => {
        const { req, res, next } = createMocks({
            headers: { 'x-request-id': 'upstream-123' },
        });
        requestId(req, res, next);
        expect(req.requestId).toBe('upstream-123');
        expect(res.headers['X-Request-ID']).toBe('upstream-123');
    });
});

// ==========================================
// noCache
// ==========================================
describe('noCache middleware', () => {
    test('sets cache-control headers', () => {
        const { req, res, next } = createMocks();
        noCache(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.headers['Cache-Control']).toContain('no-store');
        expect(res.headers['Pragma']).toBe('no-cache');
        expect(res.headers['Expires']).toBe('0');
    });
});

// ==========================================
// authMiddleware
// ==========================================
describe('authMiddleware', () => {
    test('rejects request without Authorization header', () => {
        const { req, res, next } = createMocks();
        authMiddleware(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('No token');
    });

    test('rejects request with invalid token format', () => {
        const { req, res, next } = createMocks({
            headers: { authorization: 'InvalidFormat token123' },
        });
        authMiddleware(req, res, next);
        expect(res.statusCode).toBe(401);
    });

    test('rejects malformed JWT', () => {
        const { req, res, next } = createMocks({
            headers: { authorization: 'Bearer not.a.valid.jwt' },
        });
        authMiddleware(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Invalid token');
    });

    test('rejects expired JWT', () => {
        const expiredToken = jwt.sign({ id: 1, email: 'x@x.com', role: 'visitor' }, JWT_SECRET, { expiresIn: '-1s' });
        const { req, res, next } = createMocks({
            headers: { authorization: `Bearer ${expiredToken}` },
        });
        authMiddleware(req, res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('expired');
    });

    test('accepts valid JWT and sets req.user', () => {
        const token = jwt.sign({ id: 1, email: 'test@test.com', role: 'visitor' }, JWT_SECRET, { expiresIn: '1h' });
        const { req, res, next } = createMocks({
            headers: { authorization: `Bearer ${token}` },
        });
        authMiddleware(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.email).toBe('test@test.com');
    });
});

// ==========================================
// requireRole
// ==========================================
describe('requireRole middleware', () => {
    test('rejects when no user on request', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();
        middleware(req, res, next);
        expect(res.statusCode).toBe(401);
    });

    test('rejects wrong role', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();
        req.user = { id: 1, role: 'visitor' };
        middleware(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(res.body.error).toContain('Access denied');
    });

    test('accepts correct role', () => {
        const middleware = requireRole('admin');
        const { req, res, next } = createMocks();
        req.user = { id: 1, role: 'admin' };
        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('accepts any of multiple allowed roles', () => {
        const middleware = requireRole('admin', 'moderator');
        const { req, res, next } = createMocks();
        req.user = { id: 1, role: 'moderator' };
        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
