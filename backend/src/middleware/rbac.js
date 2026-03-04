/**
 * Role-Based Access Control (RBAC) middleware
 * Usage: router.get('/admin-only', authMiddleware, requireRole('admin'), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`
            });
        }

        next();
    };
}

module.exports = { requireRole };
