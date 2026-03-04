const express = require('express');
const { query, validationResult } = require('express-validator');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { sanitizeParams, noCache, adminActionLimiter } = require('../middleware/security');

const router = express.Router();

// All admin routes require authentication + admin role + no caching
router.use(authMiddleware);
router.use(requireRole('admin'));
router.use(noCache);

// ============================================
// GET /api/admin/stats
// System overview statistics
// ============================================
router.get('/stats', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admin_count,
                (SELECT COUNT(*) FROM route_history) AS total_routes,
                (SELECT COUNT(*) FROM nodes) AS total_nodes,
                (SELECT COUNT(*) FROM edges) AS total_edges,
                (SELECT COUNT(DISTINCT user_id) FROM route_history 
                 WHERE created_at >= NOW() - INTERVAL '24 hours') AS active_today,
                (SELECT COUNT(*) FROM route_history 
                 WHERE created_at >= NOW() - INTERVAL '24 hours') AS routes_today,
                (SELECT COALESCE(SUM(distance), 0) FROM route_history) AS total_distance_m,
                (SELECT COUNT(*) FROM navigation_zones) AS total_zones
        `);

        const stats = result.rows[0];
        res.json({
            users: {
                total: parseInt(stats.total_users),
                admins: parseInt(stats.admin_count),
                activeToday: parseInt(stats.active_today),
            },
            routes: {
                total: parseInt(stats.total_routes),
                today: parseInt(stats.routes_today),
                totalDistanceKm: Math.round(parseFloat(stats.total_distance_m) / 1000 * 10) / 10,
            },
            network: {
                nodes: parseInt(stats.total_nodes),
                edges: parseInt(stats.total_edges),
                zones: parseInt(stats.total_zones),
            },
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================
// GET /api/admin/users
// List all users (paginated)
// ============================================
router.get('/users', [
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be 1-200'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        const result = await db.query(
            `SELECT id, email, name, role, created_at,
                    (SELECT COUNT(*) FROM route_history WHERE user_id = users.id) AS route_count
             FROM users
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) FROM users');

        res.json({
            users: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit,
            offset,
        });
    } catch (err) {
        console.error('Admin users error:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// ============================================
// PATCH /api/admin/users/:id/role
// Update a user's role (admin ↔ visitor)
// ============================================
router.patch('/users/:id/role', sanitizeParams, adminActionLimiter, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { role } = req.body;

        if (!['admin', 'visitor'].includes(role)) {
            return res.status(400).json({ error: 'Role must be "admin" or "visitor"' });
        }

        // Prevent self-demotion
        if (userId === req.user.id && role !== 'admin') {
            return res.status(400).json({ error: 'Cannot demote yourself' });
        }

        const result = await db.query(
            'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name, role',
            [role, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: `User role updated to ${role}`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error('Admin role update error:', err);
        res.status(500).json({ error: 'Failed to update user role' });
    }
});

// ============================================
// GET /api/admin/analytics
// Route analytics (last 30 days)
// ============================================
router.get('/analytics', async (req, res) => {
    try {
        // Routes per day (last 30 days)
        const routesPerDay = await db.query(`
            SELECT 
                DATE(created_at) AS date,
                COUNT(*) AS count
            FROM route_history
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);

        // Mode breakdown
        const modeBreakdown = await db.query(`
            SELECT 
                mode,
                COUNT(*) AS count,
                ROUND(AVG(distance)::numeric, 1) AS avg_distance_m,
                ROUND(AVG(duration)::numeric, 1) AS avg_duration_s
            FROM route_history
            GROUP BY mode
            ORDER BY count DESC
        `);

        // Peak hours
        const peakHours = await db.query(`
            SELECT 
                EXTRACT(HOUR FROM created_at) AS hour,
                COUNT(*) AS count
            FROM route_history
            GROUP BY EXTRACT(HOUR FROM created_at)
            ORDER BY hour
        `);

        // Recent routes (last 10)
        const recentRoutes = await db.query(`
            SELECT 
                rh.route_id, rh.distance, rh.duration, rh.mode, rh.created_at,
                u.name AS user_name, u.email AS user_email
            FROM route_history rh
            LEFT JOIN users u ON rh.user_id = u.id
            ORDER BY rh.created_at DESC
            LIMIT 10
        `);

        res.json({
            routesPerDay: routesPerDay.rows.map(r => ({
                date: r.date,
                count: parseInt(r.count),
            })),
            modeBreakdown: modeBreakdown.rows.map(r => ({
                mode: r.mode,
                count: parseInt(r.count),
                avgDistanceM: parseFloat(r.avg_distance_m) || 0,
                avgDurationS: parseFloat(r.avg_duration_s) || 0,
            })),
            peakHours: peakHours.rows.map(r => ({
                hour: parseInt(r.hour),
                count: parseInt(r.count),
            })),
            recentRoutes: recentRoutes.rows,
        });
    } catch (err) {
        console.error('Admin analytics error:', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

module.exports = router;
