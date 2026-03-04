const rateLimit = require('express-rate-limit');

// In test mode, use pass-through middleware instead of real rate limiters
const isTest = process.env.NODE_ENV === 'test';
const noopMiddleware = (req, res, next) => next();

/**
 * Sanitize common route params — ensures :id is a valid positive integer.
 * Usage: router.get('/:id', sanitizeParams, handler)
 */
function sanitizeParams(req, res, next) {
    if (req.params.id !== undefined) {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({ error: 'Invalid ID parameter — must be a positive integer.' });
        }
        req.params.id = String(id); // Overwrite with sanitized value
    }
    next();
}

/**
 * Adds X-Request-ID header for request tracing.
 * Generates a simple unique ID if not provided by a reverse proxy.
 */
function requestId(req, res, next) {
    const id = req.headers['x-request-id'] || `wn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    next();
}

/**
 * Adds Cache-Control: no-store for sensitive endpoints (auth, admin).
 * Prevents browser/proxy caching of sensitive data.
 */
function noCache(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
}

/**
 * Create a stricter rate limiter for auth endpoints (brute-force protection).
 * 5 attempts per 15 minutes per IP.
 */
const authLimiter = isTest ? noopMiddleware : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
    keyGenerator: (req) => req.ip,
});

/**
 * Rate limiter for admin role changes (10 per 15 min).
 */
const adminActionLimiter = isTest ? noopMiddleware : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin actions. Please try again later.' },
});

/**
 * Rate limiter for weather proxy (30 per 15 min).
 */
const weatherLimiter = isTest ? noopMiddleware : rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many weather requests. Please try again later.' },
});

module.exports = {
    sanitizeParams,
    requestId,
    noCache,
    authLimiter,
    adminActionLimiter,
    weatherLimiter,
};
